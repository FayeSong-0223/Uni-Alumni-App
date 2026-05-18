"""
Auto-update an Activity's semantic embedding when title or description
changes. Runs synchronously inside the save() call — embedding takes
~20 ms on CPU which is acceptable for the request thread.

If embedding fails for any reason (e.g. the model files haven't been
downloaded yet in a fresh container), we log and continue; the row will
get its embedding the next time someone runs the backfill command.

Why two signals
---------------
We need to know whether title/description *actually changed* before
deciding to re-embed. A pre_save snapshots the pre-save values onto the
instance; post_save compares and skips if they're identical. Without
this guard, any full save() (with update_fields=None) — e.g. updating
the image, organizer, soft-delete flag — would re-encode the model
needlessly.
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import Activity
from .semantic import embed_activity_text

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=Activity)
def snapshot_activity_text(sender, instance, **kwargs):
    """Stash the pre-save title/description on the instance so post_save
    can detect whether they actually changed."""
    if not instance.pk:
        instance._old_title = None
        instance._old_description = None
        return
    try:
        old = Activity.objects.only("title", "description").get(pk=instance.pk)
    except Activity.DoesNotExist:
        instance._old_title = None
        instance._old_description = None
        return
    instance._old_title = old.title
    instance._old_description = old.description


@receiver(post_save, sender=Activity)
def update_activity_embedding(sender, instance, created, update_fields, **kwargs):
    if update_fields is not None:
        # Caller told us exactly which fields changed. Skip embedding
        # unless title or description is among them. Our own update
        # below uses update_fields={"embedding"}, so this also breaks
        # any infinite-recursion loop.
        if not ({"title", "description"} & set(update_fields)):
            return
    elif not created:
        # Full save() with no update_fields — could be touching anything.
        # Only recompute if title or description differs from what we
        # snapshotted in pre_save. If the embedding is already populated
        # and the text didn't change, this is a no-op.
        old_title = getattr(instance, "_old_title", None)
        old_desc = getattr(instance, "_old_description", None)
        text_unchanged = (
            old_title == instance.title and old_desc == instance.description
        )
        if text_unchanged and instance.embedding:
            return

    try:
        vec = embed_activity_text(instance.title, instance.description)
    except Exception:  # pragma: no cover — model load / encode failures
        logger.exception("Failed to compute embedding for Activity %s", instance.pk)
        return

    if vec is None:
        return

    # Only write back if the value actually changed, to avoid noisy saves.
    if instance.embedding == vec:
        return

    Activity.objects.filter(pk=instance.pk).update(embedding=vec)
