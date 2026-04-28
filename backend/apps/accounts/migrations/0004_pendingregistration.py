from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_rename_email_verif_user_id_token_type_used_idx_email_verif_user_id_3f815d_idx"),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingRegistration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("username", models.CharField(max_length=30, unique=True)),
                ("email", models.EmailField(max_length=254, unique=True)),
                ("display_name", models.CharField(blank=True, default="", max_length=50)),
                ("password_hash", models.CharField(max_length=128)),
                ("code", models.CharField(max_length=6)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Pending Registration",
                "verbose_name_plural": "Pending Registrations",
                "db_table": "pending_registrations",
            },
        ),
    ]
