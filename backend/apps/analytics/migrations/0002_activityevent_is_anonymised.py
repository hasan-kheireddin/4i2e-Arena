from django.db import migrations, models


def ensure_is_anonymised_column(apps, schema_editor):
    connection = schema_editor.connection
    table_name = "activity_events"
    column_name = "is_anonymised"

    with connection.cursor() as cursor:
        table_names = connection.introspection.table_names(cursor)
        if table_name not in table_names:
            return

        columns = {
            col.name
            for col in connection.introspection.get_table_description(cursor, table_name)
        }

        if column_name not in columns:
            schema_editor.execute(
                f'ALTER TABLE "{table_name}" '
                f'ADD COLUMN "{column_name}" boolean NOT NULL DEFAULT FALSE'
            )
            return

        schema_editor.execute(
            f'UPDATE "{table_name}" '
            f'SET "{column_name}" = FALSE '
            f'WHERE "{column_name}" IS NULL'
        )

        if connection.vendor == "postgresql":
            schema_editor.execute(
                f'ALTER TABLE "{table_name}" '
                f'ALTER COLUMN "{column_name}" SET DEFAULT FALSE'
            )
            schema_editor.execute(
                f'ALTER TABLE "{table_name}" '
                f'ALTER COLUMN "{column_name}" SET NOT NULL'
            )


class Migration(migrations.Migration):

    dependencies = [
        ("analytics", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    ensure_is_anonymised_column,
                    reverse_code=migrations.RunPython.noop,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="activityevent",
                    name="is_anonymised",
                    field=models.BooleanField(
                        db_index=True,
                        default=False,
                        help_text="Whether user-identifying fields were anonymized for retention/privacy.",
                    ),
                ),
            ],
        ),
    ]
