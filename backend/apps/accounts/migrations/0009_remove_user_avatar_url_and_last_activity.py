from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0008_remove_oauthaccount"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="avatar_url",
        ),
        migrations.RemoveField(
            model_name="user",
            name="last_activity",
        ),
    ]
