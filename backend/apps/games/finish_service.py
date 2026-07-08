from __future__ import annotations

from apps.analytics.achievement_service import check_achievements_after_game
from apps.analytics.xp_service import award_xp_after_game
from apps.games.match_recording_service import record_match
from apps.games.session import GameSession


async def finalize_finished_session(session: GameSession) -> None:
    xp_awards = await award_xp_after_game(session)
    await record_match(session, xp_awards=xp_awards)
    await check_achievements_after_game(session)
