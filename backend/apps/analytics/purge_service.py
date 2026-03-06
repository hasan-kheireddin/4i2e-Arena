from __future__ import annotations
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.analytics.models import ActivityEvent

logger = logging.getLogger("analytics.retention")

DEFAULT_RETENTION_DAYS = 365


class Command(BaseCommand):
    help = (
        "Delete activity_events older than the retention window "
        "(default: 365 days).  Run periodically via cron or Celery beat."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=DEFAULT_RETENTION_DAYS,
            help=f"Events older than this many days are deleted (default {DEFAULT_RETENTION_DAYS}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print the count of events that would be deleted without actually deleting.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=5000,
            help="Number of rows to delete per batch (default 5000).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        dry_run = options["dry_run"]
        batch_size = options["batch_size"]

        cutoff = timezone.now() - timedelta(days=days)
        qs = ActivityEvent.objects.filter(created_at__lt=cutoff)

        total = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] Would delete {total} activity events "
                    f"older than {days} days (before {cutoff.isoformat()})."
                )
            )
            return

        if total == 0:
            self.stdout.write(
                self.style.SUCCESS("No activity events to purge.")
            )
            return

        self.stdout.write(
            f"Purging {total} activity events older than {days} days "
            f"(before {cutoff.isoformat()}) in batches of {batch_size}..."
        )

        deleted_total = 0
        while True:
            # Fetch a batch of PKs to delete (avoids locking the whole table)
            batch_ids = list(
                qs.values_list("id", flat=True)[:batch_size]
            )
            if not batch_ids:
                break

            count, _ = ActivityEvent.objects.filter(id__in=batch_ids).delete()
            deleted_total += count
            self.stdout.write(f"  Deleted {deleted_total}/{total}...")

        logger.info(
            "Purged %d activity events older than %d days",
            deleted_total,
            days,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Deleted {deleted_total} activity events."
            )
        )
