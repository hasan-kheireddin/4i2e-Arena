from django.db import migrations, models

# Achievements retired from the catalogue: leaderboard-rank based and
# player-level based ones. Their unlock/progress rows cascade away.
REMOVED_KEYS = [
    "pong_champion",
    "pong_legend",
    "level_5",
    "level_10",
    "level_25",
    "level_50",
    "level_100",
]


def drop_removed_achievements(apps, schema_editor):
    Achievement = apps.get_model("analytics", "Achievement")
    Achievement.objects.filter(key__in=REMOVED_KEYS).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("analytics", "0002_update_achievement_categories_and_rarities"),
    ]

    operations = [
        migrations.AlterField(
            model_name="achievement",
            name="category",
            field=models.CharField(
                choices=[
                    ("pong", "Pong"),
                    ("tictactoe", "Tic-Tac-Toe"),
                ],
                db_index=True,
                default="pong",
                max_length=20,
            ),
        ),
        migrations.RunPython(drop_removed_achievements, noop),
    ]
