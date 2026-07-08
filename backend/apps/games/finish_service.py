from __future__ import annotations

from apps.analytics.achievement_service import check_achievements_after_game
from apps.analytics.xp_service import award_xp_after_game
from apps.games.match_recording_service import (
    claim_match_record,
    complete_claimed_match_record,
)
from apps.games.session import GameSession


async def finalize_finished_session(session: GameSession) -> None:
    match_id = await claim_match_record(session)
    if match_id is None:
        return

    xp_awards = await award_xp_after_game(session)
    await complete_claimed_match_record(match_id, session, xp_awards=xp_awards)
    await check_achievements_after_game(session)
