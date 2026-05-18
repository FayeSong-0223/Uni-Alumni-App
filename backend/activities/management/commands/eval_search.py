"""
Tiny offline eval for the hybrid keyword + semantic ranker.

We want a way to tune the knobs in views.py (SEMANTIC_WEIGHT, SEMANTIC_FLOOR,
SEMANTIC_CANDIDATE_LIMIT, title weight in semantic.py) with *evidence*
rather than vibes. This command runs each query in activities/eval/
search_eval.json against the live ranking pipeline and reports whether
the top-K results contain at least one of the expected tokens in the
title or description.

It is intentionally not a unit test — it exercises real activities in
the dev database, so results depend on what data you've seeded. Treat
the hit-rate as a *trend* indicator: tweak a knob, re-run, see if the
score goes up.

Usage:
    python manage.py eval_search                 # top-5, prints per-query
    python manage.py eval_search --k 10 --quiet  # top-10, summary only
    python manage.py eval_search --file path/to/custom_eval.json
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from activities.models import Activity
from activities.views import (
    _apply_hybrid_ranking,
    _score_activity_for_query,
)


DEFAULT_EVAL_PATH = Path(__file__).resolve().parents[2] / "eval" / "search_eval.json"

# Same tokeniser shape as views._activity_tokens, kept local so we don't
# couple the eval to that helper's exact stopword set.
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9\-']*")


def _tokens(text: str) -> set[str]:
    return {t for t in TOKEN_RE.findall((text or "").lower()) if len(t) > 1}


class Command(BaseCommand):
    help = "Run the hybrid search ranker over a fixture of queries and report hit-rate."

    def add_arguments(self, parser):
        parser.add_argument(
            "--k",
            type=int,
            default=5,
            help="How many top results to inspect per query (default: 5).",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=str(DEFAULT_EVAL_PATH),
            help="Path to the eval JSON (default: activities/eval/search_eval.json).",
        )
        parser.add_argument(
            "--quiet",
            action="store_true",
            help="Suppress per-query output; print only the summary line.",
        )

    def handle(self, *args, **options):
        eval_path = Path(options["file"])
        if not eval_path.exists():
            raise CommandError(f"Eval file not found: {eval_path}")

        with eval_path.open() as f:
            cases = json.load(f)

        if not isinstance(cases, list) or not cases:
            raise CommandError("Eval file must be a non-empty JSON array.")

        k = options["k"]
        quiet = options["quiet"]

        hits = 0
        total = len(cases)

        for case in cases:
            query = case["query"]
            expect = {tok.lower() for tok in case.get("expect_any_tokens", [])}

            qs = Activity.objects.alive().upcoming()
            qs = _score_activity_for_query(qs, query)
            ranked = _apply_hybrid_ranking(qs, query)[:k]

            matched_idx = None
            for i, act in enumerate(ranked):
                content_tokens = _tokens(act.title) | _tokens(act.description)
                if content_tokens & expect:
                    matched_idx = i
                    break

            ok = matched_idx is not None
            if ok:
                hits += 1

            if not quiet:
                status = self.style.SUCCESS("HIT ") if ok else self.style.WARNING("MISS")
                where = f"@{matched_idx + 1}" if ok else "  -"
                top_titles = " | ".join(a.title for a in ranked[:3]) or "(no results)"
                self.stdout.write(
                    f"{status} {where}  q={query!r:<20}  top3: {top_titles}"
                )

        pct = (hits / total) * 100 if total else 0.0
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Hit-rate @top-{k}: {hits}/{total} ({pct:.0f}%)"
            )
        )
