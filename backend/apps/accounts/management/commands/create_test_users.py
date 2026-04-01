from django.core.management.base import BaseCommand
from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create two test users for development/testing"

    TEST_USERS = [
        {
            "username": "testuser1",
            "email": "testuser1@test.com",
            "password": "TestPass123!",
            "display_name": "Test User 1",
        },
        {
            "username": "testuser2",
            "email": "testuser2@test.com",
            "password": "TestPass456!",
            "display_name": "Test User 2",
        },
    ]

    def handle(self, *args, **options):
        for user_data in self.TEST_USERS:
            user, created = User.objects.get_or_create(
                username=user_data["username"],
                defaults={
                    "email": user_data["email"],
                    "display_name": user_data["display_name"],
                    "is_active": True,
                },
            )
            if created:
                user.set_password(user_data["password"])
                user.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created user: {user_data['username']} / {user_data['password']}"
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"User already exists: {user_data['username']}")
                )

        self.stdout.write(self.style.SUCCESS("\nTest users ready!"))
