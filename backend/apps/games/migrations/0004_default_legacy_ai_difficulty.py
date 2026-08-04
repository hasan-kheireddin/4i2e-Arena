from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0003_remove_ai_opponent_state"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE matches "
                "ALTER COLUMN ai_difficulty SET DEFAULT '';"
            ),
            reverse_sql=(
                "ALTER TABLE matches "
                "ALTER COLUMN ai_difficulty DROP DEFAULT;"
            ),
            state_operations=[],
        ),
    ]
