from django.db import migrations, models


def populate_dm_keys(apps, schema_editor):
    """Backfill dm_key for existing DM channels, merging any duplicate pairs.

    A pre-existing race in get_or_create_dm_channel allowed two separate DM
    channels to be created for the same pair of users. Before the unique
    constraint is added (in the next migration), collapse each duplicate
    group into a single channel (the oldest one), moving the duplicates'
    messages over first.
    """
    Channel = apps.get_model("chat", "Channel")
    Message = apps.get_model("chat", "Message")

    groups = {}
    for channel in Channel.objects.filter(channel_type="dm").prefetch_related("memberships"):
        member_ids = sorted(str(m.user_id) for m in channel.memberships.all())
        if len(member_ids) != 2:
            # Malformed/legacy row (not exactly 2 members) - leave dm_key null.
            continue
        key = ":".join(member_ids)
        groups.setdefault(key, []).append(channel)

    for key, channels in groups.items():
        channels.sort(key=lambda c: c.created_at)
        canonical = channels[0]
        for dup in channels[1:]:
            Message.objects.filter(channel_id=dup.id).update(channel_id=canonical.id)
            dup.delete()
        canonical.dm_key = key
        canonical.save(update_fields=["dm_key"])


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0007_message_game_id_message_game_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="channel",
            name="dm_key",
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.RunPython(populate_dm_keys, migrations.RunPython.noop),
    ]
