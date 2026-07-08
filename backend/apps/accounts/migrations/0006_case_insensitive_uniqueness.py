from django.db import migrations, models
from django.db.models import Value
from django.db.models.functions import Coalesce, Lower, NullIf


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_alter_user_preferred_language"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("username"),
                name="accounts_user_username_ci_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("display_name"),
                name="accounts_user_display_name_ci_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="pendingregistration",
            constraint=models.UniqueConstraint(
                Lower("username"),
                name="accounts_pending_username_ci_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="pendingregistration",
            constraint=models.UniqueConstraint(
                Lower("email"),
                name="accounts_pending_email_ci_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="pendingregistration",
            constraint=models.UniqueConstraint(
                Lower(Coalesce(NullIf("display_name", Value("")), "username")),
                name="accounts_pending_effective_display_ci_uniq",
            ),
        ),
    ]
