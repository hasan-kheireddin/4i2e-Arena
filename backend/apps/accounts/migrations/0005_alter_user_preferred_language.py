from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_pendingregistration"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="preferred_language",
            field=models.CharField(
                choices=[
                    ("en", "English"),
                    ("fr", "French"),
                    ("de", "German"),
                    ("ar", "Arabic"),
                ],
                default="en",
                max_length=5,
            ),
        ),
    ]
