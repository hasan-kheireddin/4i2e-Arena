# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0004_channelmembership_read_until"),
    ]

    operations = [
        migrations.AddField(
            model_name="channelmembership",
            name="notifications_muted",
            field=models.BooleanField(default=False),
        ),
    ]
