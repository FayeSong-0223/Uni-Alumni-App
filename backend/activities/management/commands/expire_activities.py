"""
Soft-delete activities whose end_time has already passed. Hard-delete those
that have been soft-deleted for more than RETAIN_DAYS (default 30) days.

Run hourly via cron / Celery beat / systemd timer:
    python manage.py expire_activities

Options:
    --dry-run          Report what would happen without writing.
    --retain-days N    Override hard-delete retention (default 30).
    --hard-delete      Actually DELETE old soft-deleted rows (default: only
                       soft-deletes newly-expired ones; hard delete happens
                       only when this flag is passed).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from activities.models import Activity


class Command(BaseCommand):
    help = "Soft-delete past activities; optionally hard-delete long-retained ones."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--retain-days", type=int, default=30)
        parser.add_argument("--hard-delete", action="store_true")

    def handle(self, *args, **options):
        now = timezone.now()
        retain_cutoff = now - timedelta(days=options["retain_days"])

        # 1. Soft delete newly-expired activities
        to_soft_delete = Activity.objects.filter(
            is_deleted=False, end_time__lt=now
        )
        count_soft = to_soft_delete.count()
        if options["dry_run"]:
            self.stdout.write(f"[dry-run] Would soft-delete {count_soft} activities")
        else:
            to_soft_delete.update(is_deleted=True, deleted_at=now)
            self.stdout.write(self.style.SUCCESS(f"Soft-deleted {count_soft} activities"))

        # 2. Optionally hard delete long-retained soft deletes
        if options["hard_delete"]:
            stale = Activity.objects.filter(
                is_deleted=True, deleted_at__lt=retain_cutoff
            )
            count_hard = stale.count()
            if options["dry_run"]:
                self.stdout.write(f"[dry-run] Would hard-delete {count_hard} activities")
            else:
                stale.delete()
                self.stdout.write(
                    self.style.SUCCESS(f"Hard-deleted {count_hard} stale activities")
                )
