from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0008_channel_dm_key"),
    ]

    operations = [
        migrations.AlterField(
            model_name="channel",
            name="dm_key",
            field=models.CharField(blank=True, max_length=80, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="channel",
            name="channel_type",
            field=models.CharField(
                choices=[("dm", "Direct Message")], default="dm", max_length=20
            ),
        ),
    ]
