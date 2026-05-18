"""
One-off command to populate Activity.embedding for rows that don't have one.

Run after deploying the semantic-search feature, or any time you suspect
embeddings have drifted (e.g. you changed the embedding model):

    python manage.py backfill_embeddings           # only missing rows
    python manage.py backfill_embeddings --all     # recompute everything
"""
from django.core.management.base import BaseCommand

from activities.models import Activity
from activities.semantic import build_activity_text, get_model


class Command(BaseCommand):
    help = "Compute semantic embeddings for Activity rows missing one."

    def add_arguments(self, parser):
        parser.add_argument(
            "--all",
            action="store_true",
            help="Recompute embeddings for every activity, not just rows where it's null.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=32,
            help="How many activities to encode at once. Larger = faster but more RAM.",
        )

    def handle(self, *args, **options):
        qs = Activity.objects.all()
        if not options["all"]:
            qs = qs.filter(embedding__isnull=True)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to embed — every activity already has a vector."))
            return

        self.stdout.write(f"Embedding {total} activit{'y' if total == 1 else 'ies'}…")
        model = get_model()
        batch_size = options["batch_size"]
        done = 0

        # We iterate in pk order so a re-run after a crash continues
        # roughly where it left off.
        for start in range(0, total, batch_size):
            batch = list(qs.order_by("pk")[start:start + batch_size])
            if not batch:
                break
            texts = [build_activity_text(a) for a in batch]
            vectors = model.encode(texts, normalize_embeddings=True)
            for activity, vec in zip(batch, vectors):
                Activity.objects.filter(pk=activity.pk).update(embedding=vec.tolist())
            done += len(batch)
            self.stdout.write(f"  {done}/{total}")

        self.stdout.write(self.style.SUCCESS(f"Done. Embedded {done} activities."))
