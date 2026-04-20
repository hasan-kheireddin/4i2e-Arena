from django.core.management.base import BaseCommand

from apps.analytics.achievement_definitions import ACHIEVEMENTS
from apps.analytics.models import Achievement


class Command(BaseCommand):
    help = "Seed the Achievement table from the static definitions catalogue."

    def add_arguments(self, parser):
        parser.add_argument(
            "--update",
            action="store_true",
            default=False,
            help="Update existing achievements (by key) with latest definitions.",
        )

    def handle(self, *args, **options):
        update = options["update"]
        created_count = 0
        updated_count = 0
        skipped_count = 0

        for defn in ACHIEVEMENTS:
            defaults = {
                "name": defn.name,
                "description": defn.description,
                "category": defn.category,
                "tier": defn.tier,
                "icon": defn.icon,
                "xp_reward": defn.xp_reward,
                "threshold": defn.threshold,
                "is_hidden": defn.is_hidden,
                "ordering_priority": defn.ordering_priority,
            }

            achievement, created = Achievement.objects.get_or_create(
                key=defn.key,
                defaults=defaults,
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  Created: {defn.key} — {defn.name}")
                )
            elif update:
                for field, value in defaults.items():
                    setattr(achievement, field, value)
                achievement.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f"  Updated: {defn.key} — {defn.name}")
                )
            else:
                skipped_count += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {created_count}, "
                f"Updated: {updated_count}, "
                f"Skipped: {skipped_count}"
            )
        )
