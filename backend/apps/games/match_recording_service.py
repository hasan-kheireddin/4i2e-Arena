from __future__ import annotations
import logging
from datetime import datetime, timezone as tz
from typing import Any, Mapping, Optional
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
from apps.games.stats_service import invalidate_match_stats
from apps.analytics.tracking_service import track_match_completed

logger = logging.getLogger("games.match_recording")

User = get_user_model()
FORFEIT_REASONS = (FinishReason.FORFEIT, FinishReason.DISCONNECT_FORFEIT)


async def record_match(
    session: GameSession,
    xp_awards: Mapping[Any, int] | None = None,
) -> Optional[str]:
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

    match_id = await _create_match_record(session, xp_awards=xp_awards)
    return match_id


def _winner_user(winner_user_id: int | None):
    if winner_user_id is None:
        return None

    try:
        return User.objects.get(pk=winner_user_id)
    except User.DoesNotExist:
        logger.warning("Winner user %s not found", winner_user_id)
        return None


def _scores_by_slot(session: GameSession) -> dict[int, int]:
    p1_score, p2_score = _extract_scores(session)
    return {
        1: p1_score,
        2: p2_score,
    }


def _build_player_results(
    session: GameSession,
    winner_user_id: int | None,
    xp_awards: Mapping[Any, int] | None = None,
) -> list[dict[str, Any]]:
    scores = _scores_by_slot(session)
    player_results = []

    for slot, player_slot in session.players.items():
        player_results.append(
            {
                "slot": slot,
                "user_id": player_slot.user_id,
                "outcome": _determine_outcome(
                    session,
                    player_slot.user_id,
                    winner_user_id=winner_user_id,
                ),
                "score": scores.get(slot, 0),
                "xp_earned": int(xp_awards.get(player_slot.user_id, 0))
                if xp_awards
                else 0,
            }
        )

    return player_results


def _track_online_pong_match(
    match_id: str,
    game_type: str,
    game_mode: str,
    duration: float,
    player_results: list[dict[str, Any]],
) -> None:
    if game_type != DBGameType.PONG or game_mode != GameMode.PVP:
        return

    duration_seconds = round(max(duration, 0), 2)
    for player_result in player_results:
        track_match_completed(
            player_result["user_id"],
            match_id=match_id,
            game_type=game_type,
            game_mode=game_mode,
            outcome=player_result["outcome"],
            duration_seconds=duration_seconds,
            score=player_result["score"],
        )


@sync_to_async
def _create_match_record(
    session: GameSession,
    xp_awards: Mapping[Any, int] | None = None,
) -> Optional[str]:
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

    winner_user_id = _resolve_winner_user_id(session)
    finish_reason = _normalize_finish_reason(finish_reason, winner_user_id)
    winner_user = _winner_user(winner_user_id)

    # Metadata from engine
    metadata = _extract_metadata(session)
    player_results = _build_player_results(session, winner_user_id, xp_awards)

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
    for player_result in player_results:
        MatchPlayer.objects.create(
            match=match,
            user_id=player_result["user_id"],
            slot=player_result["slot"],
            outcome=player_result["outcome"],
            score=player_result["score"],
            xp_earned=player_result["xp_earned"],
        )

    logger.info(
        "Match recorded: match_id=%s session=%s type=%s mode=%s "
        "duration=%.1fs winner=%s",
        match.id,
        session.game_id,
        game_type,
        game_mode,
        duration,
        winner_user_id,
    )

    # Invalidate cached stats for all human participants
    invalidate_match_stats([player_result["user_id"] for player_result in player_results])
    _track_online_pong_match(
        match_id=str(match.id),
        game_type=game_type,
        game_mode=game_mode,
        duration=duration,
        player_results=player_results,
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


def _determine_outcome(
    session: GameSession,
    user_id: int,
    winner_user_id: int | None = None,
) -> str:
    """Determine a player's outcome in the match."""
    if session.finish_reason == FinishReason.DRAW:
        return MatchOutcome.DRAW

    resolved_winner_user_id = (
        winner_user_id
        if winner_user_id is not None
        else _resolve_winner_user_id(session)
    )
    if (
        resolved_winner_user_id is None
        and session.finish_reason
        not in (FinishReason.FORFEIT, FinishReason.DISCONNECT_FORFEIT)
    ):
        return MatchOutcome.DRAW
    if resolved_winner_user_id is not None and resolved_winner_user_id == user_id:
        return MatchOutcome.WIN
    return MatchOutcome.LOSS


def _normalize_finish_reason(
    finish_reason: str,
    winner_user_id: int | None,
) -> str:
    """
    A recorded match without a winner should be treated as a draw unless it
    ended by forfeit/disconnect forfeit.
    """
    if (
        winner_user_id is None
        and finish_reason
        not in (DBFinishReason.FORFEIT, DBFinishReason.DISCONNECT_FORFEIT)
    ):
        return DBFinishReason.DRAW
    return finish_reason


def _resolve_winner_user_id(session: GameSession) -> int | None:
    """
    Resolve winner user_id from session state.

    Primary source is ``session.winner_id``. For Pong score finishes, fall back
    to mapping engine winner slot (1/2) to the matching human player.
    """
    if session.winner_id is not None:
        return session.winner_id

    if session.game_type == GameType.PONG:
        winner_slot = getattr(session.engine, "winner", None)
        if winner_slot in (1, 2):
            winner_player = session.players.get(winner_slot)
            if winner_player is not None:
                return winner_player.user_id

    return None


def _engine_state(session: GameSession) -> dict[str, Any]:
    try:
        state = session.engine.get_state()
    except Exception:
        return {}
    return state if isinstance(state, dict) else {}


def _winner_slot(session: GameSession) -> int | None:
    if session.winner_id is None:
        return None

    for slot, player_slot in session.players.items():
        if player_slot.user_id == session.winner_id:
            return slot
    return None


def _forfeit_score_tuple(winner_slot: int | None, win_score: int) -> tuple[int, int]:
    if winner_slot == 1:
        return (win_score, 0)
    if winner_slot == 2:
        return (0, win_score)
    return (0, 0)


def _extract_pong_scores(session: GameSession) -> tuple[int, int]:
    if session.finish_reason in FORFEIT_REASONS and session.winner_id is not None:
        return _forfeit_score_tuple(_winner_slot(session), 7)

    state = _engine_state(session)
    p1 = state.get("player1", {}).get("score", 0)
    p2 = state.get("player2", {}).get("score", 0)
    return (int(p1), int(p2))


def _extract_tictactoe_scores(session: GameSession) -> tuple[int, int]:
    if session.winner_id is None:
        return (0, 0)
    return _forfeit_score_tuple(_winner_slot(session), 1)


def _extract_scores(session: GameSession) -> tuple[int, int]:
    """
    Extract player 1 / player 2 scores from the engine state.

    For Pong, scores come from state["player1"]["score"] and state["player2"]["score"].
    On forfeit/disconnect the score is enforced as 7-0 for the winner.
    For TTT, the winner gets 1 and the loser/draw gets 0.
    """
    if session.game_type == GameType.PONG:
        return _extract_pong_scores(session)
    if session.game_type == GameType.TICTACTOE:
        return _extract_tictactoe_scores(session)

    return (0, 0)


def _get_player_score(session: GameSession, slot: int) -> int:
    """Get a specific player's score."""
    return _scores_by_slot(session).get(slot, 0)


def _extract_pong_metadata(state: dict[str, Any]) -> dict[str, Any]:
    metadata = {
        "final_scores": {
            "1": state.get("player1", {}).get("score", 0),
            "2": state.get("player2", {}).get("score", 0),
        },
        "ball_speed": state.get("ball", {}).get("speed"),
    }
    stats = state.get("stats", {})
    if not isinstance(stats, dict):
        return metadata

    metadata["pong_stats"] = {
        "max_rally_hits": int(stats.get("max_rally_hits", 0)),
        "player_hits": stats.get("player_hits", {}),
        "player_max_consecutive_blocks": stats.get(
            "player_max_consecutive_blocks",
            {},
        ),
        "player_misses": stats.get("player_misses", {}),
        "player_max_deficit": stats.get("player_max_deficit", {}),
        "player_scored_three_under_ten": stats.get(
            "player_scored_three_under_ten",
            {},
        ),
    }
    return metadata


def _count_non_empty_moves(board: list[Any]) -> int:
    return sum(1 for cell in board if cell is not None and cell != "")


def _extract_tictactoe_metadata(state: dict[str, Any]) -> dict[str, Any]:
    board = state.get("board", [])
    metadata = {
        "final_board": board,
        "total_moves": _count_non_empty_moves(board),
        "is_draw": state.get("is_draw", False),
        "winner_symbol": state.get("winner"),
    }
    stats = state.get("stats", {})
    if not isinstance(stats, dict):
        return metadata

    metadata["ttt_stats"] = {
        "player_block_counts": stats.get("player_block_counts", {}),
    }
    return metadata


def _extract_metadata(session: GameSession) -> dict[str, Any]:
    """
    Extract interesting metadata from the engine state for
    historical analysis.
    """
    state = _engine_state(session)
    if not state:
        return {}

    metadata: dict[str, Any]
    if session.game_type == GameType.PONG:
        metadata = _extract_pong_metadata(state)
    elif session.game_type == GameType.TICTACTOE:
        metadata = _extract_tictactoe_metadata(state)
    else:
        metadata = {}

    metadata["game_type"] = session.game_type.value
    metadata["ai_opponent"] = session.ai is not None
    if session.ai_difficulty:
        metadata["ai_difficulty"] = session.ai_difficulty

    return metadata
