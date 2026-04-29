"""
Activity API — smart search, recommendations, discover vs booked.

Search strategy (documented so future maintainers understand the scoring):

The free-text search bar matches only against the *title* and *description*,
which mirrors how mainstream event sites (Eventbrite, Meetup, Ticketmaster)
handle search. Tags, category, and location are faceted filters — users
*select* them, they don't type them — so they live on their own query
params (`tags=`, `category=`, `location=`) and never contaminate the
free-text relevance calculation.

Relevance score for free-text:

    score = 50 * title_icontains_match     # any term substring in title
          + 20 * title_istartswith_match   # bonus: title starts with the query
          + 10 * description_match         # any term substring in description

Post-filter: drop rows whose score < RELEVANCE_THRESHOLD (default 5).
Tie-break: secondary sort by `start_time ASC` so the nearest upcoming wins.

The starts-with bonus exists so that typing "Yoga" surfaces the event
actually titled "Yoga in the Park" above an event titled "Beginner Yoga"
that only contains the word later — which matches user intuition.

Implemented in pure Django ORM so it runs on MySQL today without extra
infrastructure. The plan doc describes a Meilisearch + embeddings upgrade
path; the API shape stays identical so the swap is non-breaking.
"""
import re
from datetime import datetime, timedelta

from django.db.models import Case, F, IntegerField, Q, Value, When
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from profiles.models import Profile

from .models import Activity, ActivityBooking
from .permissions import IsAdminOrReadOnly
from .serializers import ActivityBookingSerializer, ActivitySerializer

RELEVANCE_THRESHOLD = 5
AUTOCOMPLETE_MIN_CHARS = 1
AUTOCOMPLETE_LIMIT = 10

# Recommendation tuning constants.
# Raw max = 30 + 40 + 25 + 25 = 120 → normalized to 0-100 on output.
RECS_MAX_RAW = 120
# Events within this many days ahead get full recency bonus, decaying
# linearly to zero at the horizon. Anchored to how people plan socials
# (week-of enthusiasm, month-out planning; beyond that, lukewarm).
RECS_RECENCY_WEIGHT = 25
RECS_RECENCY_HORIZON_DAYS = 30

# MMR diversity mixing — λ=0.7 keeps relevance dominant while punishing
# near-duplicates (same tag set). Below 0.5 the list feels random; above
# 0.9 it collapses back to pure relevance.
MMR_LAMBDA = 0.7
RECS_CANDIDATE_POOL = 80   # scored candidates before MMR re-rank
RECS_RETURN_LIMIT = 50

# Minimum length for a token to count as a "meaningful" search term once
# stopwords are stripped. Below this, we treat the query as too ambiguous
# to produce useful list results (it would match half the corpus). The
# autocomplete dropdown still fires at 1 char so the user sees feedback
# — only the main list filter uses this threshold.
MIN_MEANINGFUL_CHARS = 3

# Common English stopwords. Standard pattern: search engines silently drop
# these before matching because they appear in nearly every description
# and carry no useful signal. Kept deliberately short — this list covers
# ~95% of real noise without surprising users whose legitimate query
# happens to include one of these words (we still return results for the
# remaining non-stopword tokens).
STOPWORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "from", "has", "have", "he", "i", "if", "in", "is",
    "it", "its", "me", "my", "no", "not", "of", "on", "or", "our",
    "she", "so", "that", "the", "their", "them", "these", "they",
    "this", "those", "to", "was", "we", "were", "will", "with",
    "you", "your",
})


def _extract_search_terms(query, *, min_len=MIN_MEANINGFUL_CHARS):
    """
    Tokenise a free-text query into meaningful search terms.

    Rules (match how mainstream search UIs clean input):
      1. Lower-case everything.
      2. Split on whitespace; strip punctuation at token edges.
      3. Drop stopwords.
      4. Drop tokens shorter than `min_len` (default MIN_MEANINGFUL_CHARS).

    `min_len` is overridable because recommendation signals come from
    structured profile fields (not a live typing stream), so short tokens
    like "AI", "ML", "3D" are legitimate and must not be stripped. Search
    still passes the default to prevent autocomplete noise.

    Returns [] if nothing meaningful remains. Callers treat [] as "nothing
    searchable" — for the list endpoint that means empty results; for the
    recs endpoint it means "skip this field, fall back to other signals".
    """
    raw = (query or "").lower().split()
    cleaned = []
    for tok in raw:
        # strip leading/trailing punctuation but keep internal hyphens/
        # apostrophes (so "co-op" and "won't" survive intact)
        tok = re.sub(r"^[^\w]+|[^\w]+$", "", tok)
        if not tok or tok in STOPWORDS:
            continue
        if len(tok) < min_len:
            continue
        cleaned.append(tok)
    return cleaned


def _parse_date(value):
    """Accepts 'YYYY-MM-DD' or full ISO; returns aware datetime or None."""
    if not value:
        return None
    try:
        if "T" in value:
            return timezone.make_aware(datetime.fromisoformat(value.replace("Z", "")))
        return timezone.make_aware(datetime.strptime(value, "%Y-%m-%d"))
    except (ValueError, TypeError):
        return None


def _score_activity_for_query(qs, query):
    """
    Annotate an Activity queryset with a weighted relevance score against
    a free-text query. Title and description only — tags/category/location
    are filters (separate params), not free-text targets.

    Matching uses word-boundary regex (\\bTERM) so typing "mo" only hits
    words that *start* with "mo" (movie, month) and not ones that merely
    contain those letters somewhere mid-word (amount, demo, lemon). This
    eliminates the substring-noise problem of raw icontains matching.

    Stopwords and short tokens are stripped first via
    _extract_search_terms, so "is yoga" -> ["yoga"] and "mo" -> []. When
    nothing meaningful remains, all rows score 0 (below the threshold)
    and the caller yields an empty result list.

    Uses ORM-level CASE/WHEN so it works on MySQL; iregex is supported
    natively on MySQL 8+, Postgres, and SQLite.
    """
    terms = _extract_search_terms(query)
    if not terms:
        # Query is all stopwords / too-short tokens. Annotate zero so the
        # threshold filter yields empty results without special-casing.
        return qs.annotate(relevance=Value(0, output_field=IntegerField()))

    title_q = Q()
    title_starts_q = Q()
    desc_q = Q()
    # `title_starts_q` only fires if the *first* meaningful term is a
    # title prefix. Rewards "yoga" landing on titles like "Yoga in the
    # Park" over "Beginner Yoga", without over-rewarding multi-word
    # queries where only the first word happens to start a title.
    first_term = terms[0]
    title_starts_q |= Q(title__istartswith=first_term)
    for term in terms:
        # \b anchors the match at a word boundary. re.escape guards
        # against stray regex meta-chars in user input (e.g. a typed '.'
        # that survived tokenisation).
        pattern = r"\b" + re.escape(term)
        title_q |= Q(title__iregex=pattern)
        desc_q |= Q(description__iregex=pattern)

    return qs.annotate(
        title_score=Case(When(title_q, then=50), default=0, output_field=IntegerField()),
        title_starts_score=Case(
            When(title_starts_q, then=20), default=0, output_field=IntegerField()
        ),
        desc_score=Case(When(desc_q, then=10), default=0, output_field=IntegerField()),
        relevance=F("title_score") + F("title_starts_score") + F("desc_score"),
    )


def _apply_tag_filter(qs, tags_list):
    """
    Filter a queryset so only activities whose `tags` JSON list contains *any*
    of the given tag strings (case-insensitive substring match) are kept.

    Matching is intentionally substring-based to tolerate case/whitespace
    differences in how tags were saved (e.g. "AI", "ai", " AI "). Callers
    should still send canonical tag strings from the /activities/tags/
    endpoint; this is defensive.

    NOTE: Tags are no longer exposed as a filter-chip UI (we switched to a
    controlled `category` taxonomy — see _apply_category_filter). Tags
    remain on the model as free-form metadata shown on activity cards and
    used by the recommendation engine. This helper is kept so power-user
    API clients can still filter by tag via query params.
    """
    cleaned = [t.strip() for t in tags_list if t and t.strip()]
    if not cleaned:
        return qs
    tag_q = Q()
    for t in cleaned:
        tag_q |= Q(tags__icontains=t)
    return qs.filter(tag_q)


def _apply_category_filter(qs, categories_list):
    """
    Filter to activities whose `category` field matches ANY of the given
    category keys (OR semantics — matches the "tick multiple chips" UX).

    Silently ignores keys that aren't in Activity.CATEGORY_CHOICES so a
    typo or stale client can't cause an empty-set trap. Empty list is a
    no-op.
    """
    valid_keys = {key for key, _ in Activity.CATEGORY_CHOICES}
    cleaned = [c.strip().lower() for c in categories_list if c and c.strip()]
    cleaned = [c for c in cleaned if c in valid_keys]
    if not cleaned:
        return qs
    return qs.filter(category__in=cleaned)


def _activity_tokens(activity):
    """Stable bag-of-tokens for an activity, used by match reasons and MMR."""
    parts = [activity.title or "", activity.description or ""]
    parts.extend(str(t) for t in (activity.tags or []))
    text = " ".join(parts).lower()
    raw = re.findall(r"[a-z0-9][a-z0-9\-']*", text)
    return {t for t in raw if len(t) > 1 and t not in STOPWORDS}


def _profile_tokens(user_profile):
    """Union of meaningful tokens from a profile's interest fields."""
    if user_profile is None:
        return set()
    bag = []
    bag.extend(user_profile.hobbies or [])
    bag.extend(user_profile.companies or [])
    for slug in (user_profile.professional_interests or []):
        bag.append(str(slug).replace("-", " "))
    text = " ".join(str(x) for x in bag).lower()
    raw = re.findall(r"[a-z0-9][a-z0-9\-']*", text)
    return {t for t in raw if len(t) > 1 and t not in STOPWORDS}


def _tag_match_reasons(activity, user_profile):
    """Short UI labels explaining why this activity surfaced.

    Uses word-boundary token overlap (not raw substring) so "Google" no
    longer fires on "Googled" and "AI" doesn't match "fair".
    """
    reasons = []
    act_tokens = _activity_tokens(activity)

    hobby_tokens = {
        t
        for h in (user_profile.hobbies or [])
        for t in re.findall(r"[a-z0-9][a-z0-9\-']*", str(h).lower())
        if len(t) > 1 and t not in STOPWORDS
    }
    if hobby_tokens & act_tokens:
        reasons.append("Matches your hobbies")

    prof_tokens = set()
    for slug in (user_profile.professional_interests or []):
        prof_tokens.update(re.findall(r"[a-z0-9][a-z0-9\-']*", str(slug).lower()))
        prof_tokens.update(
            re.findall(r"[a-z0-9][a-z0-9\-']*", str(slug).replace("-", " ").lower())
        )
    prof_tokens = {t for t in prof_tokens if len(t) > 1 and t not in STOPWORDS}
    if prof_tokens & act_tokens:
        reasons.append("Matches your professional interests")

    company_tokens = {
        t
        for c in (user_profile.companies or [])
        for t in re.findall(r"[a-z0-9][a-z0-9\-']*", str(c).lower())
        if len(t) > 1 and t not in STOPWORDS
    }
    if company_tokens & act_tokens:
        reasons.append("Mentions a company you've worked at")

    return reasons


class ActivityViewSet(viewsets.ModelViewSet):
    serializer_class = ActivitySerializer
    # Admin-only for write; alumni can read and book (booking uses a custom action
    # that bypasses the write restriction because it creates an ActivityBooking,
    # not an Activity).
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["location", "organizer", "category"]
    # Free-text SearchFilter (powers ?search= on the base list endpoint) is
    # scoped to title + description, matching the smart_search policy.
    # Tags and location are surfaced via dedicated filters/params.
    search_fields = ["title", "description"]
    ordering_fields = ["start_time", "created_at"]
    ordering = ["start_time"]

    def get_queryset(self):
        """Hide soft-deleted activities from ALL endpoints by default."""
        return Activity.objects.alive().select_related("organizer")

    def perform_create(self, serializer):
        serializer.save(organizer=self.request.user)

    # -- Core discovery --------------------------------------------------------

    @action(detail=False, methods=["get"], url_path="search")
    def smart_search(self, request):
        """
        GET /api/activities/search/?q=...&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
            &categories=workshop&categories=social&tags=music

        `q` is free-text over title + description only (tags are NOT matched).
        `categories` is a repeatable param for the category-chip filter (one
        of Activity.CATEGORY_CHOICES); multiple values OR together. Legacy
        singular `category=` is still honoured for backward compatibility.
        `tags` is a repeatable power-user filter (no chip UI); legacy single
        `tag=` is still honoured. Returns only upcoming, non-deleted
        activities; when `q` is present the list is filtered to relevance
        >= RELEVANCE_THRESHOLD and sorted relevance DESC, start_time ASC.
        Empty `q` falls through to chronological order.
        """
        q = request.GET.get("q", "").strip()
        date_from = _parse_date(request.GET.get("date_from"))
        date_to = _parse_date(request.GET.get("date_to"))
        # Prefer repeatable `categories`; fall back to legacy singular
        # `category` if older clients are still sending it.
        categories_list = request.GET.getlist("categories")
        legacy_category = request.GET.get("category", "").strip()
        if legacy_category and not categories_list:
            categories_list = [legacy_category]
        tags_list = request.GET.getlist("tags")
        legacy_tag = request.GET.get("tag", "").strip()
        if legacy_tag and not tags_list:
            tags_list = [legacy_tag]

        qs = self.get_queryset().upcoming()
        if date_from:
            qs = qs.filter(start_time__gte=date_from)
        if date_to:
            # inclusive end-of-day
            qs = qs.filter(start_time__lte=date_to + timedelta(days=1))
        qs = _apply_category_filter(qs, categories_list)
        qs = _apply_tag_filter(qs, tags_list)

        if q:
            qs = _score_activity_for_query(qs, q)
            qs = qs.filter(relevance__gte=RELEVANCE_THRESHOLD)
            qs = qs.order_by("-relevance", "start_time")
        else:
            qs = qs.order_by("start_time")

        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response({"query": q, "total": qs.count(), "results": serializer.data})

    @action(detail=False, methods=["get"], url_path="autocomplete")
    def autocomplete(self, request):
        """
        Suggestion list for the activity search bar.

        Titles only (no tag/description matching). We prefer titles that
        *start with* the query so e.g. typing "Yo" surfaces "Yoga in the
        Park" before "Beginner Yoga"; if fewer than AUTOCOMPLETE_LIMIT
        prefix matches exist we top up with substring matches.
        """
        q = request.GET.get("q", "").strip().lower()
        if len(q) < AUTOCOMPLETE_MIN_CHARS:
            return Response([])

        base = self.get_queryset().upcoming()
        starts = list(base.filter(title__istartswith=q)[:AUTOCOMPLETE_LIMIT])
        if len(starts) < AUTOCOMPLETE_LIMIT:
            remaining = AUTOCOMPLETE_LIMIT - len(starts)
            starts_ids = {a.id for a in starts}
            contains = list(
                base.filter(title__icontains=q)
                .exclude(id__in=starts_ids)[:remaining]
            )
            results = starts + contains
        else:
            results = starts

        suggestions = [{"id": a.id, "title": a.title, "type": "activity"} for a in results]
        return Response(suggestions)

    @action(detail=False, methods=["get"], url_path="tags")
    def available_tags(self, request):
        """
        GET /api/activities/tags/

        Returns the distinct tags used by upcoming, non-deleted activities,
        sorted by frequency (most-used first) then alphabetically. Shape:
            [{ "tag": "music", "count": 12 }, ...]

        No longer powers a filter-chip row — categories took that role. Kept
        for backward compatibility and potential future uses (e.g. an admin
        tag-management UI).
        """
        from collections import Counter
        counter = Counter()
        for tags in self.get_queryset().upcoming().values_list("tags", flat=True):
            for t in (tags or []):
                s = str(t).strip()
                if s:
                    counter[s] += 1
        sorted_tags = sorted(counter.items(), key=lambda x: (-x[1], x[0].lower()))
        return Response([{"tag": t, "count": c} for t, c in sorted_tags])

    @action(detail=False, methods=["get"], url_path="categories")
    def available_categories(self, request):
        """
        GET /api/activities/categories/

        Returns the controlled category taxonomy with per-category counts
        for *upcoming* activities. Shape:
            [{ "key": "workshop", "label": "Workshop", "count": 12 }, ...]

        Categories with zero upcoming activities are omitted so the UI chip
        row never shows dead filters (tapping one would yield an empty list
        and look broken). Ordered to match Activity.CATEGORY_CHOICES —
        stable, not frequency-based, so the chip row doesn't reshuffle
        between requests. This is the controlled-vocabulary pattern used
        by Eventbrite / Meetup / LinkedIn Events: a finite, curated set of
        chips instead of free-form tags that can proliferate unchecked.
        """
        from collections import Counter
        counter = Counter(
            self.get_queryset().upcoming().values_list("category", flat=True)
        )
        results = []
        for key, label in Activity.CATEGORY_CHOICES:
            count = counter.get(key, 0)
            if count == 0:
                continue
            results.append({"key": key, "label": label, "count": count})
        return Response(results)

    @action(detail=False, methods=["get"], url_path="recommendations")
    def recommendations(self, request):
        """
        Personalized upcoming activities for the current user.

        Scoring (all word-boundary, no raw substring):
            hobby_score    (0 or 30)
            prof_score     (0 or 40)
            company_score  (0 or 25)
            recency_score  (0..25, linear decay over 30 days)
        Raw max = 120, normalized to 0-100 before returning.

        After scoring we pull the top RECS_CANDIDATE_POOL and re-rank with
        MMR so the list isn't dominated by 10 near-duplicate events
        (e.g. 10 "AI meetup" variants pushing everything else off-screen).

        Cold start (no profile signals) → recency-only sort.
        """
        user = request.user
        try:
            profile = user.profile
        except Profile.DoesNotExist:
            profile = None

        # Fix #3: never recommend something the user has already booked.
        # Kept symmetric with the /discover endpoint so the two feeds don't
        # disagree on what counts as "new to me".
        booked_ids = ActivityBooking.objects.filter(
            user=user, status="confirmed"
        ).values_list("activity_id", flat=True)
        qs = self.get_queryset().upcoming().exclude(id__in=booked_ids)

        hobbies = [str(h).lower() for h in (profile.hobbies or [])] if profile else []
        prof_interests = list(profile.professional_interests or []) if profile else []
        companies = [str(c).lower() for c in (profile.companies or [])] if profile else []

        if not (hobbies or prof_interests or companies):
            # Cold-start: recency-first (nearest events).
            qs = qs.order_by("start_time")
            page = self.paginate_queryset(qs)
            return (
                self.get_paginated_response(self.get_serializer(page, many=True).data)
                if page is not None
                else Response(self.get_serializer(qs, many=True).data)
            )

        # Fix #1: tokenize recommendation signals with min_len=2 so short but
        # legitimate tokens like "AI", "ML", "VR", "3D", "HP", "GE" survive.
        # The 3-char floor is a search-UX guard (stops autocomplete noise),
        # not a semantic rule — profile fields are structured, not typed.
        def _toks(s):
            return _extract_search_terms(s, min_len=2)

        # Word-boundary matching across all fields.
        hobby_q = Q()
        for h in hobbies:
            for tok in _toks(h):
                pat = r"\b" + re.escape(tok)
                hobby_q |= (
                    Q(tags__iregex=pat)
                    | Q(description__iregex=pat)
                    | Q(title__iregex=pat)
                )

        prof_q = Q()
        for slug in prof_interests:
            # Slugs like "machine-learning" — match both the slug form in
            # tags and the expanded "machine learning" in title/description.
            slug_lower = str(slug).lower()
            prof_q |= Q(tags__iregex=r"\b" + re.escape(slug_lower))
            for tok in _toks(slug_lower.replace("-", " ")):
                pat = r"\b" + re.escape(tok)
                prof_q |= (
                    Q(tags__iregex=pat)
                    | Q(description__iregex=pat)
                    | Q(title__iregex=pat)
                )

        # Fix #2: include `tags` in the company match. Previously company_q
        # only searched title/description, which silently punished users
        # whose employer was surfaced via a tag (e.g. admin tags an event
        # "google" / "microsoft"). Now symmetric with hobby_q / prof_q.
        company_q = Q()
        for c in companies:
            for tok in _toks(c):
                pat = r"\b" + re.escape(tok)
                company_q |= (
                    Q(tags__iregex=pat)
                    | Q(description__iregex=pat)
                    | Q(title__iregex=pat)
                )

        # Short-circuit empty-Q paths (e.g. user has only 2-char hobbies).
        def _case(q, weight):
            if len(q) == 0:
                return Value(0, output_field=IntegerField())
            return Case(When(q, then=weight), default=0, output_field=IntegerField())

        qs = qs.annotate(
            hobby_score=_case(hobby_q, 30),
            prof_score=_case(prof_q, 40),
            company_score=_case(company_q, 25),
            content_score=F("hobby_score") + F("prof_score") + F("company_score"),
        ).order_by("-content_score", "start_time")

        # Pull a pool, then compute recency + MMR re-rank in Python.
        candidates = list(qs[:RECS_CANDIDATE_POOL])
        now = timezone.now()

        def _recency(act):
            if not act.start_time:
                return 0.0
            days = max(0, (act.start_time - now).total_seconds() / 86400.0)
            if days >= RECS_RECENCY_HORIZON_DAYS:
                return 0.0
            # Linear decay: full weight today, zero at horizon.
            return RECS_RECENCY_WEIGHT * (1 - days / RECS_RECENCY_HORIZON_DAYS)

        scored = []
        for act in candidates:
            raw = (act.content_score or 0) + _recency(act)
            act._match_reasons = _tag_match_reasons(act, profile) if profile else []
            act._match_score = round(raw * 100 / RECS_MAX_RAW)
            scored.append((act, raw))

        # --- MMR diversity re-rank -----------------------------------------
        # Greedy selection: each step picks the candidate that maximizes
        #     λ * relevance  -  (1 - λ) * max_jaccard(candidate, already_picked)
        # Similarity is Jaccard over the activity's token bag (title +
        # description + tags). Cheap, deterministic, no embeddings needed.
        tokens_by_act = {id(act): _activity_tokens(act) for act, _ in scored}
        max_raw = max((r for _, r in scored), default=1) or 1
        pool = list(scored)
        selected = []
        while pool and len(selected) < RECS_RETURN_LIMIT:
            best = None
            best_score = -1.0
            for idx, (act, raw) in enumerate(pool):
                norm_rel = raw / max_raw
                if selected:
                    tks = tokens_by_act[id(act)]
                    worst_sim = 0.0
                    for picked in selected:
                        ptks = tokens_by_act[id(picked)]
                        union = tks | ptks
                        if not union:
                            continue
                        sim = len(tks & ptks) / len(union)
                        if sim > worst_sim:
                            worst_sim = sim
                else:
                    worst_sim = 0.0
                mmr = MMR_LAMBDA * norm_rel - (1 - MMR_LAMBDA) * worst_sim
                if mmr > best_score:
                    best_score = mmr
                    best = idx
            act, _ = pool.pop(best)
            selected.append(act)

        page = self.paginate_queryset(selected)
        serializer = self.get_serializer(page if page is not None else selected, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="discover")
    def discover(self, request):
        """
        Default activity list for the Discover tab.
        Excludes activities the user has already booked (confirmed bookings).
        Supports the same date / tag filters as smart_search so the Discover
        feed can be pre-filtered by the tag-chip UI without switching to the
        search endpoint.
        """
        user = request.user
        booked_ids = ActivityBooking.objects.filter(
            user=user, status="confirmed"
        ).values_list("activity_id", flat=True)

        qs = self.get_queryset().upcoming().exclude(id__in=booked_ids)

        date_from = _parse_date(request.GET.get("date_from"))
        date_to = _parse_date(request.GET.get("date_to"))
        categories_list = request.GET.getlist("categories")
        legacy_category = request.GET.get("category", "").strip()
        if legacy_category and not categories_list:
            categories_list = [legacy_category]
        tags_list = request.GET.getlist("tags")
        legacy_tag = request.GET.get("tag", "").strip()
        if legacy_tag and not tags_list:
            tags_list = [legacy_tag]

        if date_from:
            qs = qs.filter(start_time__gte=date_from)
        if date_to:
            qs = qs.filter(start_time__lte=date_to + timedelta(days=1))
        qs = _apply_category_filter(qs, categories_list)
        qs = _apply_tag_filter(qs, tags_list)

        q = request.GET.get("q", "").strip()
        if q:
            qs = _score_activity_for_query(qs, q).filter(
                relevance__gte=RELEVANCE_THRESHOLD
            ).order_by("-relevance", "start_time")
        else:
            qs = qs.order_by("start_time")

        page = self.paginate_queryset(qs)
        serializer = self.get_serializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    # -- Booking actions -------------------------------------------------------

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated])
    def book(self, request, pk=None):
        # Lookup against the FULL queryset so non-staff can still book
        activity = Activity.objects.alive().filter(pk=pk).first()
        if not activity:
            return Response(
                {"error": "Activity not found."}, status=status.HTTP_404_NOT_FOUND
            )

        existing = ActivityBooking.objects.filter(
            activity=activity, user=request.user
        ).first()
        if existing and existing.status == "confirmed":
            return Response(
                {"error": "You have already booked this activity."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if existing and existing.status == "cancelled":
            # Re-book: flip status back to confirmed if spots are available
            if not activity.spots_available:
                return Response(
                    {"error": "This activity is fully booked."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing.status = "confirmed"
            existing.name = request.data.get("name", existing.name)
            existing.email = request.data.get("email", existing.email)
            existing.notes = request.data.get("notes", existing.notes)
            existing.save()
            return Response(
                {"message": "Re-booked successfully.", "booking": ActivityBookingSerializer(existing).data},
                status=status.HTTP_200_OK,
            )

        if not activity.spots_available:
            return Response(
                {"error": "This activity is fully booked."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ActivityBookingSerializer(
            data={
                "activity": activity.id,
                "name": request.data.get("name", ""),
                "email": request.data.get("email", ""),
                "notes": request.data.get("notes", ""),
            }
        )
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(
                {"message": "Booking successful!", "booking": serializer.data},
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"])
    def bookings(self, request, pk=None):
        activity = self.get_object()
        bookings = activity.bookings.filter(status="confirmed")

        # Only staff or the activity's organizer can see the full booking
        # list (names, emails, notes). For everyone else, expose just the
        # confirmed-participant count plus the requester's own booking
        # status — enough to render the UI without leaking other users' PII.
        if request.user.is_staff or activity.organizer_id == request.user.id:
            return Response(ActivityBookingSerializer(bookings, many=True).data)

        my_booking = bookings.filter(user=request.user).first()
        return Response({
            "participant_count": bookings.count(),
            "my_booking": (
                ActivityBookingSerializer(my_booking).data if my_booking else None
            ),
        })

    @action(detail=True, methods=["delete"], url_path="cancel_booking",
            permission_classes=[IsAuthenticated])
    def cancel_booking(self, request, pk=None):
        activity = Activity.objects.alive().filter(pk=pk).first()
        if not activity:
            return Response(
                {"error": "Activity not found."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            booking = ActivityBooking.objects.get(
                activity=activity, user=request.user, status="confirmed"
            )
        except ActivityBooking.DoesNotExist:
            return Response(
                {"error": "No confirmed booking found for this activity."},
                status=status.HTTP_404_NOT_FOUND,
            )
        booking.status = "cancelled"
        booking.save()
        return Response(
            {"message": "Booking cancelled successfully.", "booking_id": booking.id},
            status=status.HTTP_200_OK,
        )


class ActivityBookingViewSet(viewsets.ModelViewSet):
    serializer_class = ActivityBookingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ["status", "activity"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            ActivityBooking.objects.filter(user=self.request.user)
            .select_related("activity")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        """
        GET /api/bookings/calendar/?month=YYYY-MM
        Returns the user's bookings falling in that month, grouped by date.
        Designed for the Booked Activities calendar view.
        """
        month_str = request.GET.get("month")
        today = timezone.now().date()
        if month_str:
            try:
                year, month = month_str.split("-")
                year, month = int(year), int(month)
            except (ValueError, TypeError):
                year, month = today.year, today.month
        else:
            year, month = today.year, today.month

        # month bounds
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)
        start = timezone.make_aware(start)
        end = timezone.make_aware(end)

        bookings = (
            ActivityBooking.objects.filter(
                user=request.user,
                status="confirmed",
                activity__is_deleted=False,
                activity__start_time__gte=start,
                activity__start_time__lt=end,
            )
            .select_related("activity")
            .order_by("activity__start_time")
        )

        # Group by ISO date
        buckets = {}
        for b in bookings:
            key = b.activity.start_time.date().isoformat()
            buckets.setdefault(key, []).append(ActivityBookingSerializer(b).data)

        return Response({"month": f"{year:04d}-{month:02d}", "days": buckets})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_activity_image(request, pk):
    """Admin-only: upload/replace an activity's hero image."""
    if not request.user.is_staff:
        return Response(
            {"detail": "Only admins can upload activity images."},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        activity = Activity.objects.alive().get(pk=pk)
    except Activity.DoesNotExist:
        return Response(
            {"detail": "Activity not found."}, status=status.HTTP_404_NOT_FOUND
        )
    image = request.FILES.get("image")
    if not image:
        return Response(
            {"detail": "Field 'image' is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if image.size > 10 * 1024 * 1024:
        return Response(
            {"detail": "Image exceeds 10MB limit."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    activity.image = image
    activity.save(update_fields=["image"])
    return Response(ActivitySerializer(activity, context={"request": request}).data)
