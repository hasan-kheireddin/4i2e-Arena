import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailVerificationToken",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "token_type",
                    models.CharField(
                        choices=[
                            ("email_verify", "Email Verification"),
                            ("password_reset", "Password Reset"),
                        ],
                        max_length=20,
                    ),
                ),
                ("code", models.CharField(max_length=100)),
                ("expires_at", models.DateTimeField()),
                ("used", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="verification_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Email Verification Token",
                "verbose_name_plural": "Email Verification Tokens",
                "db_table": "email_verification_tokens",
                "indexes": [
                    models.Index(
                        fields=["user", "token_type", "used"],
                        name="email_verif_user_id_token_type_used_idx",
                    )
                ],
            },
        ),
    ]
