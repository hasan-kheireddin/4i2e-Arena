from __future__ import annotations
import logging
from datetime import datetime, timezone as tz
from typing import Any, Optional
from asgiref.sync import sync_to_async
from django.contrib.auth import get_user_model
from apps.games.models import (
    FinishReason as DBFinishReason,
    GameMode,
    GameType as DBGameType,
    Match,
    MatchOutcome,
    MatchPlayer,
)
from apps.games.session import (
    FinishReason,
    GameSession,
    GameType,
)
from apps.games.stats_service import invalidate_user_stats
from apps.analytics.tracking_service import track_match_completed

logger = logging.getLogger("games.match_recording")

User = get_user_model()

async def record_match(session: GameSession) -> Optional[str]:
    """
    Persist a finished game session to the database.

    Creates one ``Match`` row and one ``MatchPlayer`` row per human
    participant.  Skips canceled / server-error games.

    Returns the Match UUID (as string) on success, or ``None`` if the
    match was not recorded (e.g. canceled, already recorded).
    """
    # Don't record non-games
    if session.finish_reason in (FinishReason.CANCELED, FinishReason.SERVER_ERROR):
        logger.debug(
            "Skipping match recording for %s (reason=%s)",
            session.game_id, session.finish_reason,
        )
        return None

    # Don't record if no human players
    if not session.players:
        return None

    match_id = await _create_match_record(session)
    return match_id

@sync_to_async
def _create_match_record(session: GameSession) -> Optional[str]:
    """
    Synchronous database operations wrapped with sync_to_async.
    """
    # Guard against duplicate recording (idempotent)
    if Match.objects.filter(game_session_id=session.game_id).exists():
        logger.warning(
            "Match already recorded for session %s — skipping",
            session.game_id,
        )
        return None

    # --- Derive match attributes ---
    game_type = _map_game_type(session.game_type)
    finish_reason = _map_finish_reason(session.finish_reason)
    game_mode = _determine_game_mode(session)

    # Timestamps
    started_at = datetime.fromtimestamp(session.created_at, tz=tz.utc)
    finished_at = datetime.fromtimestamp(
        session.finished_at or session.created_at, tz=tz.utc,
    )
    duration = (session.finished_at or session.created_at) - session.created_at

    # Scores
    p1_score, p2_score = _extract_scores(session)

    # Winner user object (for FK)
    winner_user = None
    if session.winner_id is not None:
        try:
            winner_user = User.objects.get(pk=session.winner_id)
        except User.DoesNotExist:
            logger.warning("Winner user %s not found", session.winner_id)

    # Metadata from engine
    metadata = _extract_metadata(session)

    # --- Create Match row ---
    match = Match.objects.create(
        game_session_id=session.game_id,
        game_type=game_type,
        game_mode=game_mode,
        finish_reason=finish_reason,
        winner=winner_user,
        started_at=started_at,
        finished_at=finished_at,
        duration_seconds=round(max(duration, 0), 2),
        player1_score=p1_score,
        player2_score=p2_score,
        ai_difficulty=session.ai_difficulty or "",
        metadata=metadata,
    )

    # --- Create MatchPlayer rows ---
    for slot, player_slot in session.players.items():
        outcome = _determine_outcome(session, player_slot.user_id)
        score = _get_player_score(session, slot)

        MatchPlayer.objects.create(
            match=match,
            user_id=player_slot.user_id,
            slot=slot,
            outcome=outcome,
            score=score,
            xp_earned=0,  # XP is tracked via the xp_service, not here
        )

    logger.info(
        "Match recorded: match_id=%s session=%s type=%s mode=%s "
        "duration=%.1fs winner=%s",
        match.id,
        session.game_id,
        game_type,
        game_mode,
        duration,
        session.winner_id,
    )

    # Invalidate cached stats for all human participants
    for _slot, player_slot in session.players.items():
        invalidate_user_stats(player_slot.user_id)

    # Track activity analytics only for online Pong matches.
    if game_type == DBGameType.PONG and game_mode == GameMode.PVP:
        for slot, player_slot in session.players.items():
            outcome = _determine_outcome(session, player_slot.user_id)
            score = _get_player_score(session, slot)
            track_match_completed(
                player_slot.user_id,
                match_id=str(match.id),
                game_type=game_type,
                game_mode=game_mode,
                outcome=outcome,
                duration_seconds=round(max(duration, 0), 2),
                score=score,
            )

    return str(match.id)

def _map_game_type(game_type: GameType) -> str:
    """Map in-memory GameType enum to DB GameType choice."""
    mapping = {
        GameType.PONG: DBGameType.PONG,
        GameType.TICTACTOE: DBGameType.TICTACTOE,
    }
    return mapping.get(game_type, DBGameType.PONG)


def _map_finish_reason(reason: FinishReason | None) -> str:
    """Map in-memory FinishReason to DB FinishReason choice."""
    if reason is None:
        return DBFinishReason.SCORE
    mapping = {
        FinishReason.SCORE: DBFinishReason.SCORE,
        FinishReason.DRAW: DBFinishReason.DRAW,
        FinishReason.FORFEIT: DBFinishReason.FORFEIT,
        FinishReason.DISCONNECT_FORFEIT: DBFinishReason.DISCONNECT_FORFEIT,
        FinishReason.CANCELED: DBFinishReason.CANCELED,
        FinishReason.SERVER_ERROR: DBFinishReason.SERVER_ERROR,
    }
    return mapping.get(reason, DBFinishReason.SCORE)


def _determine_game_mode(session: GameSession) -> str:
    """Determine the game mode (PvP / PvA)."""
    if session.ai is not None:
        return GameMode.PVA
    return GameMode.PVP


def _determine_outcome(session: GameSession, user_id: int) -> str:
    """Determine a player's outcome in the match."""
    if session.finish_reason == FinishReason.DRAW:
        return MatchOutcome.DRAW
    if session.winner_id is not None and session.winner_id == user_id:
        return MatchOutcome.WIN
    return MatchOutcome.LOSS

def _extract_scores(session: GameSession) -> tuple[int, int]:
    """
    Extract player 1 / player 2 scores from the engine state.

    For Pong, scores come from state["player1"]["score"] and state["player2"]["score"].
    On forfeit/disconnect the score is enforced as 7-0 for the winner.
    For TTT, the winner gets 1 and the loser/draw gets 0.
    """
    _forfeit_reasons = (FinishReason.FORFEIT, FinishReason.DISCONNECT_FORFEIT)

    if session.game_type == GameType.PONG:
        # Forfeit → always 7-0 for the winner
        if session.finish_reason in _forfeit_reasons and session.winner_id is not None:
            for slot, ps in session.players.items():
                if ps.user_id == session.winner_id:
                    return (7, 0) if slot == 1 else (0, 7)

        try:
            state = session.engine.get_state()
        except Exception:
            return (0, 0)

        p1 = state.get("player1", {}).get("score", 0)
        p2 = state.get("player2", {}).get("score", 0)
        return (int(p1), int(p2))

    elif session.game_type == GameType.TICTACTOE:
        # Winner gets 1, loser/draw gets 0
        if session.winner_id is not None:
            for slot, ps in session.players.items():
                if ps.user_id == session.winner_id:
                    return (1, 0) if slot == 1 else (0, 1)
        return (0, 0)  # draw

    return (0, 0)


def _get_player_score(session: GameSession, slot: int) -> int:
    """Get a specific player's score."""
    _forfeit_reasons = (FinishReason.FORFEIT, FinishReason.DISCONNECT_FORFEIT)

    if session.game_type == GameType.PONG:
        # Forfeit → winner gets 7, loser gets 0
        if session.finish_reason in _forfeit_reasons and session.winner_id is not None:
            ps = session.players.get(slot)
            if ps is not None:
                return 7 if ps.user_id == session.winner_id else 0

        try:
            state = session.engine.get_state()
        except Exception:
            return 0
        player_key = f"player{slot}"
        return int(state.get(player_key, {}).get("score", 0))

    elif session.game_type == GameType.TICTACTOE:
        # Winner gets 1, loser/draw gets 0
        ps = session.players.get(slot)
        if ps is None:
            return 0
        if session.winner_id is not None and ps.user_id == session.winner_id:
            return 1
        return 0

    return 0

def _extract_metadata(session: GameSession) -> dict[str, Any]:
    """
    Extract interesting metadata from the engine state for
    historical analysis.
    """
    metadata: dict[str, Any] = {}

    try:
        state = session.engine.get_state()
    except Exception:
        return metadata

    if session.game_type == GameType.PONG:
        metadata["final_scores"] = {
            "1": state.get("player1", {}).get("score", 0),
            "2": state.get("player2", {}).get("score", 0),
        }
        metadata["ball_speed"] = state.get("ball", {}).get("speed")

    elif session.game_type == GameType.TICTACTOE:
        metadata["final_board"] = state.get("board", [])
        metadata["total_moves"] = sum(
            1 for cell in state.get("board", [])
            if cell is not None and cell != ""
        )
        metadata["is_draw"] = state.get("is_draw", False)
        metadata["winner_symbol"] = state.get("winner")

    metadata["game_type"] = session.game_type.value
    metadata["ai_opponent"] = session.ai is not None
    if session.ai_difficulty:
        metadata["ai_difficulty"] = session.ai_difficulty

    return metadata
