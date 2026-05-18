"""
Auto-update an Activity's semantic embedding when title or description
changes. Runs synchronously inside the save() call — embedding takes
~20 ms on CPU which is acceptable for the request thread.

If embedding fails for any reason (e.g. the model files haven't been
downloaded yet in a fresh container), we log and continue; the row will
get its embedding the next time someone runs the backfill command.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Activity
from .semantic import build_activity_text, embed_text

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Activity)
def update_activity_embedding(sender, instance, created, update_fields, **kwargs):
    # Skip if the save explicitly didn't touch title/description (e.g. a
    # soft-delete or image upload). update_fields is None on full saves,
    # in which case we always recompute.
    if update_fields is not None:
        if not ({"title", "description"} & set(update_fields)):
            return
        # Guard against infinite recursion: our own .save() below sets
        # update_fields={"embedding"}, which has no overlap with
        # title/description, so the early-return above handles it.

    try:
        vec = embed_text(build_activity_text(instance))
    except Exception:  # pragma: no cover — model load / encode failures
        logger.exception("Failed to compute embedding for Activity %s", instance.pk)
        return

    if vec is None:
        return

    # Only write back if the value actually changed, to avoid noisy saves.
    if instance.embedding == vec:
        return

    Activity.objects.filter(pk=instance.pk).update(embedding=vec)
