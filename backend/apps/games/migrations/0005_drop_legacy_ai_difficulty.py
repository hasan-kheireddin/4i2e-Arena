from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0004_default_legacy_ai_difficulty"),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE matches DROP COLUMN IF EXISTS ai_difficulty;",
            reverse_sql=(
                "ALTER TABLE matches ADD COLUMN ai_difficulty "
                "varchar(12) NOT NULL DEFAULT '';"
            ),
            state_operations=[],
        ),
    ]
