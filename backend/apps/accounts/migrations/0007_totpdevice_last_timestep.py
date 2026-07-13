from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_case_insensitive_uniqueness"),
    ]

    operations = [
        migrations.AddField(
            model_name="totpdevice",
            name="last_timestep",
            field=models.BigIntegerField(
                blank=True,
                help_text="Last accepted TOTP counter; prevents code replay.",
                null=True,
            ),
        ),
    ]
