import re

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.views import APIView
from django.db.models import Q, Case, When, IntegerField, F

# Theoretical maxima per scorer — used to normalize scores to 0-100 so the
# alumni and activity sides are directly comparable and weights stay easy
# to reason about when tuning.
SIMILARITY_MAX = 215  # 40+30+25+25+20+30+30+15
SEARCH_MAX = 190      # 50+30+25+20+15+18+10+22

# Small stopword set — mirrors activities/views.py so the two search paths
# behave consistently. Kept deliberately short so legitimate queries still
# return results via other tokens.
_STOPWORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "in", "is", "it", "of", "on", "or", "the", "to", "with",
})


def _tokenize(value):
    """Lowercase, split on non-word chars, drop stopwords and length-1 tokens.

    Works on strings or on lists of strings (JSON fields). Word-boundary
    tokenization replaces raw ``icontains`` so "Google" no longer matches
    "Googled" and "AI" no longer matches "fair".
    """
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        text = " ".join(str(v) for v in value if v is not None)
    else:
        text = str(value)
    tokens = re.findall(r"[a-z0-9][a-z0-9\-']*", text.lower())
    return {t for t in tokens if len(t) > 1 and t not in _STOPWORDS}


def _word_q(field, term):
    """Q helper: match ``term`` as a whole word inside ``field`` via iregex."""
    # re.escape guards against regex metacharacters in user input.
    return Q(**{f"{field}__iregex": r"\b" + re.escape(term)})

from profiles.filters import ProfileFilter
from profiles.models import Company, Profile, ProfessionalInterestOption
from profiles.serializers import (
    CompanySuggestionSerializer,
    ProfessionalInterestOptionSerializer,
    ProfileListSerializer,
    ProfileSerializer,
)


class MyProfileView(generics.RetrieveUpdateAPIView):
    """Retrieve or update the authenticated user's own profile."""

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        profile, _created = Profile.objects.get_or_create(user=self.request.user)
        return profile


class AvatarUploadView(APIView):
    """Dedicated avatar upload endpoint (multipart). Keeps binary out of the main profile PATCH."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        image = request.FILES.get("avatar")
        if not image:
            return Response(
                {"detail": "No file provided under field 'avatar'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Basic sanity checks
        if image.size > 5 * 1024 * 1024:
            return Response(
                {"detail": "Image exceeds 5MB limit."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.profile_picture = image
        profile.save(update_fields=["profile_picture"])
        return Response(ProfileSerializer(profile, context={"request": request}).data)

    def delete(self, request):
        profile, _ = Profile.objects.get_or_create(user=request.user)
        if profile.profile_picture:
            profile.profile_picture.delete(save=False)
            profile.profile_picture = None
            profile.save(update_fields=["profile_picture"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileSearchView(generics.ListAPIView):
    """Search and filter public alumni profiles."""

    serializer_class = ProfileListSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = ProfileFilter
    # Companies are included here so that typing a company name in the search
    # bar surfaces alumni — but companies is NOT a filter.
    search_fields = [
        "name",
        "expertise",
        "hobbies",
        "professional_interests",
        "companies",
        "degree",
    ]

    def get_queryset(self):
        return Profile.objects.filter(
            user__is_profile_public=True
        ).select_related("user")


class ProfileDetailView(generics.RetrieveAPIView):
    """View another user's profile, respecting their privacy settings."""

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "user__alumni_id"
    lookup_url_kwarg = "alumni_id"

    def get_queryset(self):
        return Profile.objects.select_related("user")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if not instance.user.is_profile_public:
            return Response(
                {"detail": "This profile is private."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().retrieve(request, *args, **kwargs)


class ProfessionalInterestsListView(generics.ListAPIView):
    """Returns the predefined professional-interest dropdown options."""

    serializer_class = ProfessionalInterestOptionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return ProfessionalInterestOption.objects.filter(is_active=True)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def companies_autocomplete(request):
    """Prefix/substring autocomplete over the Company dictionary."""
    q = request.GET.get("q", "").strip().lower()
    if len(q) < 1:
        return Response([])
    qs = Company.objects.filter(name_normalized__icontains=q).order_by(
        "-use_count", "name_display"
    )[:10]
    return Response(CompanySuggestionSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def autocomplete_suggestions(request):
    """
    Unified autocomplete for the alumni search bar. Groups suggestions by type
    so the frontend can render them with clear section headers. Includes:
      - professional_interests (from dropdown dictionary)
      - companies (from user-generated catalog)
      - degrees / industries / roles / expertise / hobbies (from existing profiles)
    """
    query = request.GET.get("q", "").strip().lower()
    if not query or len(query) < 2:
        return Response({"professional_interests": [], "companies": [], "other": []})

    # 1. Professional interests (dictionary-backed)
    prof_options = ProfessionalInterestOption.objects.filter(
        is_active=True, label__icontains=query
    ).order_by("sort_order")[:8]
    prof_suggestions = [
        {"slug": o.slug, "label": o.label, "type": "professional_interest"}
        for o in prof_options
    ]

    # 2. Companies (catalog-backed)
    company_qs = Company.objects.filter(name_normalized__icontains=query).order_by(
        "-use_count", "name_display"
    )[:8]
    company_suggestions = [
        {"label": c.name_display, "type": "company"} for c in company_qs
    ]

    # 3. Other strings from profile data (degrees/industries/roles/expertise/hobbies)
    other = set()
    profiles = Profile.objects.filter(user__is_profile_public=True)
    for degree in profiles.values_list("degree", flat=True).distinct():
        if degree and query in degree.lower():
            other.add(degree)
    for industry in profiles.values_list("industry", flat=True).distinct():
        if industry and query in industry.lower():
            other.add(industry)
    for role in profiles.values_list("current_role", flat=True).distinct():
        if role and query in role.lower():
            other.add(role)
    # JSON list fields need Python-side iteration
    for p in profiles.only("expertise", "hobbies"):
        for skill in (p.expertise or []):
            if isinstance(skill, str) and query in skill.lower():
                other.add(skill)
        for h in (p.hobbies or []):
            if isinstance(h, str) and query in h.lower():
                other.add(h)

    other_list = list(other)
    # Rank: exact > startswith > contains
    other_list.sort(
        key=lambda s: (
            0 if s.lower() == query else (1 if s.lower().startswith(query) else 2),
            s.lower(),
        )
    )
    other_suggestions = [{"label": s, "type": "other"} for s in other_list[:10]]

    return Response(
        {
            "professional_interests": prof_suggestions,
            "companies": company_suggestions,
            "other": other_suggestions,
        }
    )


class EnhancedProfileSearchView(generics.ListAPIView):
    """Enhanced search with ranking and intelligent filtering.

    Filters allowed: industry, graduation_year, degree, hobbies, professional_interests, expertise.
    Companies are NOT a filter here — only exposed via autocomplete/search text.
    """

    serializer_class = ProfileListSerializer
    permission_classes = [IsAuthenticated]

    def _apply_filters(self, profiles):
        params = self.request.GET
        industry = params.get("industry", "").strip()
        graduation_year = params.get("graduation_year", "").strip()
        degree = params.get("degree", "").strip()
        hobbies = params.get("hobbies", "").strip()
        professional_interests = params.get("professional_interests", "").strip()
        expertise = params.get("expertise", "").strip()

        if industry:
            profiles = profiles.filter(industry__iexact=industry)
        if graduation_year:
            profiles = profiles.filter(graduation_year=graduation_year)
        if degree:
            profiles = profiles.filter(degree__icontains=degree)
        if hobbies:
            profiles = profiles.filter(hobbies__icontains=hobbies)
        if professional_interests:
            profiles = profiles.filter(
                professional_interests__icontains=professional_interests
            )
        if expertise:
            profiles = profiles.filter(expertise__icontains=expertise)
        return profiles

    def get_queryset(self):
        user = self.request.user
        query = self.request.GET.get("search", "").strip()

        profiles = (
            Profile.objects.filter(user__is_profile_public=True)
            .exclude(user=user)
            .select_related("user")
        )
        profiles = self._apply_filters(profiles)

        if not query:
            return self._get_recommendations(user, profiles)
        return self._get_search_results(query, profiles, user)

    def _get_recommendations(self, user, profiles):
        try:
            user_profile = user.profile
        except Profile.DoesNotExist:
            return list(profiles.order_by("-user__date_joined")[:20])

        scored = []
        for p in profiles:
            raw, reasons = self._calculate_similarity(user_profile, p)
            scored.append((p, raw, reasons))
        scored.sort(key=lambda x: x[1], reverse=True)

        results = []
        for p, raw, reasons in scored[:20]:
            p._match_score = round(raw * 100 / SIMILARITY_MAX)
            p._match_reasons = reasons
            results.append(p)
        return results

    def _get_search_results(self, query, profiles, user):
        # Tokenize once — drops stopwords and punctuation, lowercases.
        query_terms = list(_tokenize(query))
        if not query_terms:
            return profiles.none()

        name_q = Q()
        degree_q = Q()
        industry_q = Q()
        role_q = Q()
        expertise_q = Q()
        hobbies_q = Q()
        prof_interest_q = Q()
        companies_q = Q()

        # Word-boundary matching across every field so typing "Google"
        # doesn't match "Googled" and "AI" doesn't match "fair".
        for term in query_terms:
            name_q |= _word_q("name", term)
            degree_q |= _word_q("degree", term)
            industry_q |= _word_q("industry", term)
            role_q |= _word_q("current_role", term)
            expertise_q |= _word_q("expertise", term)
            hobbies_q |= _word_q("hobbies", term)
            prof_interest_q |= _word_q("professional_interests", term)
            companies_q |= _word_q("companies", term)

        profiles = (
            profiles.annotate(
                name_score=Case(When(name_q, then=50), default=0, output_field=IntegerField()),
                degree_score=Case(When(degree_q, then=30), default=0, output_field=IntegerField()),
                industry_score=Case(When(industry_q, then=25), default=0, output_field=IntegerField()),
                role_score=Case(When(role_q, then=20), default=0, output_field=IntegerField()),
                expertise_score=Case(When(expertise_q, then=15), default=0, output_field=IntegerField()),
                # Professional interests rank above general hobbies
                prof_score=Case(When(prof_interest_q, then=18), default=0, output_field=IntegerField()),
                hobbies_score=Case(When(hobbies_q, then=10), default=0, output_field=IntegerField()),
                companies_score=Case(When(companies_q, then=22), default=0, output_field=IntegerField()),
                total_score=F("name_score") + F("degree_score") + F("industry_score")
                + F("role_score") + F("expertise_score") + F("prof_score")
                + F("hobbies_score") + F("companies_score"),
            )
            .filter(
                name_q | degree_q | industry_q | role_q | expertise_q
                | hobbies_q | prof_interest_q | companies_q
            )
            .order_by("-total_score", "-user__date_joined")
        )
        # Attach normalized score + human-readable reasons for each hit.
        results = list(profiles)
        query_token_set = set(query_terms)
        for p in results:
            p._match_score = round((p.total_score or 0) * 100 / SEARCH_MAX)
            p._match_reasons = self._search_match_reasons(p, query_token_set)
        return results

    def _calculate_similarity(self, user_profile, other_profile):
        """Return (raw_score, reasons). Raw score ranges 0..SIMILARITY_MAX."""
        score = 0
        reasons = []

        if user_profile.degree and other_profile.degree:
            if user_profile.degree.lower().strip() == other_profile.degree.lower().strip():
                score += 40
                reasons.append(f"Same degree ({other_profile.degree})")

        if user_profile.industry and other_profile.industry:
            if user_profile.industry.lower().strip() == other_profile.industry.lower().strip():
                score += 30
                reasons.append(f"Same industry ({other_profile.industry})")

        if user_profile.graduation_year and other_profile.graduation_year:
            year_diff = abs(user_profile.graduation_year - other_profile.graduation_year)
            if year_diff == 0:
                score += 25
                reasons.append(f"Graduated the same year ({other_profile.graduation_year})")
            elif year_diff <= 2:
                score += 15
                reasons.append(f"Graduated within 2 years ({other_profile.graduation_year})")
            elif year_diff <= 5:
                score += 10

        # Token-based overlap on JSON list fields — handles "Machine Learning"
        # vs "machine-learning" vs "ML in research" consistently.
        exp_shared = _tokenize(user_profile.expertise) & _tokenize(other_profile.expertise)
        if exp_shared:
            score += min(len(exp_shared) * 8, 25)
            reasons.append(f"Shared skills: {', '.join(sorted(exp_shared)[:3])}")

        hobby_shared = _tokenize(user_profile.hobbies) & _tokenize(other_profile.hobbies)
        if hobby_shared:
            score += min(len(hobby_shared) * 6, 20)
            reasons.append(f"Shared hobbies: {', '.join(sorted(hobby_shared)[:3])}")

        # Professional interests are controlled slugs — direct set intersection.
        if user_profile.professional_interests and other_profile.professional_interests:
            pi_shared = set(user_profile.professional_interests) & set(
                other_profile.professional_interests
            )
            if pi_shared:
                score += min(len(pi_shared) * 10, 30)
                reasons.append("Shared professional interests")

        company_shared = _tokenize(user_profile.companies) & _tokenize(other_profile.companies)
        if company_shared:
            score += min(len(company_shared) * 12, 30)  # strongest signal
            reasons.append(f"Worked at {sorted(company_shared)[0].title()}")

        if user_profile.current_role and other_profile.current_role:
            if user_profile.current_role.lower().strip() == other_profile.current_role.lower().strip():
                score += 15
                reasons.append(f"Same role ({other_profile.current_role})")

        return score, reasons

    def _search_match_reasons(self, profile, query_tokens):
        """Turn a search-query hit into a short human-readable explanation."""
        reasons = []
        if query_tokens & _tokenize(profile.name):
            reasons.append("Name matches your search")
        if query_tokens & _tokenize(profile.companies):
            reasons.append("Worked at a company you searched")
        if query_tokens & _tokenize(profile.expertise):
            reasons.append("Listed skills match")
        if query_tokens & _tokenize(profile.professional_interests):
            reasons.append("Professional interests match")
        if query_tokens & _tokenize(profile.hobbies):
            reasons.append("Hobbies match")
        return reasons
