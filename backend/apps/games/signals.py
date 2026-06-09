from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.games.models import Match, MatchPlayer
from apps.games.stats_service import invalidate_match_stats


def _invalidate_match_participants(match_id, extra_user_ids=None):
    user_ids = list(
        MatchPlayer.objects.filter(match_id=match_id)
        .values_list("user_id", flat=True)
    )
    if extra_user_ids:
        user_ids.extend(extra_user_ids)
    user_ids = list(dict.fromkeys(user_ids))
    if user_ids:
        transaction.on_commit(lambda: invalidate_match_stats(user_ids))


@receiver(post_save, sender=MatchPlayer)
def invalidate_stats_after_match_player_save(sender, instance, **kwargs):
    _invalidate_match_participants(instance.match_id)


@receiver(post_delete, sender=MatchPlayer)
def invalidate_stats_after_match_player_delete(sender, instance, **kwargs):
    _invalidate_match_participants(instance.match_id, [instance.user_id])


@receiver(post_save, sender=Match)
def invalidate_stats_after_match_save(sender, instance, created, **kwargs):
    if not created:
        _invalidate_match_participants(instance.pk)
