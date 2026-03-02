from __future__ import annotations
import logging
import uuid
from typing import Any, Optional
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.utils import timezone
from apps.games.session import (
    FinishReason,
    GameSession,
    GameType,
    create_session,
    generate_game_id,
    get_session,
)

logger = logging.getLogger("tournaments.service")


def tournament_group_name(tournament_id: str | uuid.UUID) -> str:
    """Return the channel-layer group name for a tournament."""
    return f"tournament_{tournament_id}"

async def on_game_finished(session: GameSession) -> None:
    """
    Called by game consumers when a game session ends.

    If the session is linked to a tournament round, this function:
      1. Marks the round as completed.
      2. Advances the winner in the bracket.
      3. Broadcasts bracket updates via the tournament channel group.
      4. Prepares the next match if both players are known.
    """
    # Check if there is a tournament round linked to this session
    tournament_round = await _find_round_by_session(session.game_id)
    if tournament_round is None:
        return  # Not a tournament game — nothing to do

    logger.info(
        "Tournament game finished: game_id=%s round_id=%s winner_id=%s reason=%s",
        session.game_id,
        tournament_round.id,
        session.winner_id,
        session.finish_reason,
    )

    # Determine scores from the engine state
    p1_score, p2_score = _extract_scores(session)

    # Determine winner user ID
    winner_user_id = session.winner_id
    if winner_user_id is None:
        # Fallback: if engine has a winner slot, resolve from session players
        winner_user_id = await _resolve_winner_from_engine(session, tournament_round)

    if winner_user_id is None:
        logger.error(
            "Cannot determine winner for tournament game game_id=%s",
            session.game_id,
        )
        return

    # --- DB operations (sync) ---
    result = await _complete_round_and_advance(
        tournament_round.id, winner_user_id, p1_score, p2_score
    )

    if result is None:
        return

    tournament_id, tournament_status, next_round_data, winner_data = result

    # --- Broadcast tournament update ---
    await _broadcast_tournament_update(
        tournament_id=tournament_id,
        event_type="round_completed",
        data={
            "round_id": str(tournament_round.id),
            "round_number": tournament_round.round_number,
            "match_index": tournament_round.match_index,
            "winner_id": winner_user_id,
            "player1_score": p1_score,
            "player2_score": p2_score,
            "tournament_status": tournament_status,
            "next_round": next_round_data,
            "tournament_winner": winner_data,
        },
    )

    if next_round_data and next_round_data.get("ready"):
        await _broadcast_tournament_update(
            tournament_id=tournament_id,
            event_type="match_ready",
            data={
                "round_id": next_round_data["id"],
                "round_number": next_round_data["round_number"],
                "match_index": next_round_data["match_index"],
                "player1_id": next_round_data["player1_id"],
                "player2_id": next_round_data["player2_id"],
                "game_session_id": next_round_data.get("game_session_id"),
            },
        )

async def link_session_to_round(
    game_id: str,
    round_id: str | uuid.UUID,
) -> bool:
    """
    Associate a game session ID with a TournamentRound.

    Called when a tournament match game session is created (either
    automatically or via the tournament consumer).

    Returns True on success, False if the round was not found.
    """
    return await _link_session_db(game_id, round_id)


async def create_tournament_game_session(
    round_id: str | uuid.UUID,
    game_type_str: str,
) -> Optional[str]:
    """
    Create a new in-memory game session for a tournament round
    and link it to the round in the DB.

    Returns the game_id on success, or None if the round is not
    ready (missing players) or already has a session.
    """
    round_data = await _get_round_for_session_creation(round_id)
    if round_data is None:
        return None

    existing_session_id, p1_id, p2_id, game_type_db = round_data

    # Don't create if already linked
    if existing_session_id:
        return str(existing_session_id)

    # Don't create if players are missing
    if p1_id is None or p2_id is None:
        return None

    game_type = game_type_str or game_type_db

    # Create the in-memory session
    game_id = generate_game_id()

    # Import engines dynamically to avoid circular imports
    if game_type == "pong":
        from apps.games.pong_engine import PongEngine
        engine = PongEngine()
    else:
        from apps.games.tictactoe_engine import TicTacToeEngine
        engine = TicTacToeEngine()

    gt = GameType.PONG if game_type == "pong" else GameType.TICTACTOE
    create_session(game_type=gt, engine=engine, game_id=game_id)

    # Link in DB
    await _link_session_db(game_id, round_id)

    logger.info(
        "Created tournament game session: game_id=%s round_id=%s type=%s",
        game_id, round_id, game_type,
    )
    return game_id


async def is_tournament_game(game_id: str) -> bool:
    """Return True if the game_id is linked to any tournament round."""
    return await _check_tournament_link(game_id)


async def prepare_round_matches(tournament_id: str | uuid.UUID) -> list[dict]:
    """
    For the current round of a tournament, create game sessions for
    all matches that have both players assigned.

    Returns a list of dicts:
        [{"round_id": ..., "game_id": ..., "player1_id": ..., "player2_id": ...}]
    """
    ready_rounds = await _get_ready_rounds(tournament_id)
    results = []

    for rd in ready_rounds:
        round_id, p1_id, p2_id, game_type = rd
        game_id = await create_tournament_game_session(round_id, game_type)
        if game_id:
            results.append({
                "round_id": str(round_id),
                "game_id": game_id,
                "player1_id": p1_id,
                "player2_id": p2_id,
            })

    return results


async def get_tournament_stats(tournament_id: str | uuid.UUID) -> dict:
    """Compute tournament statistics (wins, placements, etc.)."""
    return await _compute_stats(tournament_id)


async def get_player_tournament_stats(user_id: int) -> dict:
    """Compute a player's aggregate tournament statistics."""
    return await _compute_player_stats(user_id)


@sync_to_async
def _find_round_by_session(game_id: str):
    """Find a TournamentRound by its game_session_id."""
    from apps.tournaments.models import TournamentRound

    try:
        return TournamentRound.objects.select_related(
            "tournament", "player1", "player2"
        ).get(game_session_id=game_id)
    except TournamentRound.DoesNotExist:
        return None


@sync_to_async
def _complete_round_and_advance(
    round_id: uuid.UUID,
    winner_user_id: int,
    p1_score: int,
    p2_score: int,
) -> Optional[tuple]:
    """
    Mark a round as completed, advance the winner, return state.

    Returns a tuple:
        (tournament_id, tournament_status, next_round_data, winner_data)
    or None on failure.
    """
    from apps.tournaments.models import (
        RoundStatus,
        TournamentRound,
        TournamentStatus,
    )

    try:
        round_obj = TournamentRound.objects.select_related(
            "tournament", "player1", "player2"
        ).get(pk=round_id)
    except TournamentRound.DoesNotExist:
        logger.error("Round %s not found for completion", round_id)
        return None

    if round_obj.status in (RoundStatus.COMPLETED, RoundStatus.BYE):
        logger.warning("Round %s already completed, skipping", round_id)
        return None

    # Mark round completed
    round_obj.complete(
        winner_id=winner_user_id,
        p1_score=p1_score,
        p2_score=p2_score,
    )

    # Advance winner in bracket
    tournament = round_obj.tournament
    next_round = tournament.advance_winner(round_obj)

    # Refresh tournament state
    tournament.refresh_from_db()

    # Build next round data
    next_round_data = None
    if next_round:
        next_round.refresh_from_db()
        ready = (
            next_round.player1_id is not None
            and next_round.player2_id is not None
        )
        next_round_data = {
            "id": str(next_round.id),
            "round_number": next_round.round_number,
            "match_index": next_round.match_index,
            "player1_id": next_round.player1_id,
            "player2_id": next_round.player2_id,
            "ready": ready,
        }

    # Build winner data if tournament completed
    winner_data = None
    if tournament.status == TournamentStatus.COMPLETED and tournament.winner:
        winner_data = {
            "id": tournament.winner_id,
            "username": tournament.winner.username,
        }

    return (
        str(tournament.id),
        tournament.status,
        next_round_data,
        winner_data,
    )


@sync_to_async
def _link_session_db(game_id: str, round_id: str | uuid.UUID) -> bool:
    """Link a game session ID to a tournament round in the DB."""
    from apps.tournaments.models import TournamentRound

    updated = TournamentRound.objects.filter(pk=round_id).update(
        game_session_id=game_id,
        status="in_progress",
        started_at=timezone.now(),
    )
    return updated > 0


@sync_to_async
def _check_tournament_link(game_id: str) -> bool:
    """Check if a game_id is associated with any tournament round."""
    from apps.tournaments.models import TournamentRound

    return TournamentRound.objects.filter(game_session_id=game_id).exists()


@sync_to_async
def _get_round_for_session_creation(round_id: str | uuid.UUID):
    """Fetch round data needed to create a game session."""
    from apps.tournaments.models import TournamentRound

    try:
        rd = TournamentRound.objects.select_related("tournament").get(pk=round_id)
        return (
            rd.game_session_id,
            rd.player1_id,
            rd.player2_id,
            rd.tournament.game_type,
        )
    except TournamentRound.DoesNotExist:
        return None


@sync_to_async
def _get_ready_rounds(tournament_id: str | uuid.UUID) -> list[tuple]:
    """Fetch all pending rounds with both players for a tournament."""
    from apps.tournaments.models import RoundStatus, Tournament, TournamentRound

    try:
        tournament = Tournament.objects.get(pk=tournament_id)
    except Tournament.DoesNotExist:
        return []

    rounds = TournamentRound.objects.filter(
        tournament=tournament,
        round_number=tournament.current_round,
        status=RoundStatus.PENDING,
        player1__isnull=False,
        player2__isnull=False,
        game_session_id__isnull=True,
    )

    return [
        (rd.id, rd.player1_id, rd.player2_id, tournament.game_type)
        for rd in rounds
    ]


@sync_to_async
def _compute_stats(tournament_id: str | uuid.UUID) -> dict:
    """Compute statistics for a tournament."""
    from apps.tournaments.models import (
        RoundStatus,
        Tournament,
        TournamentEntry,
        TournamentRound,
    )

    try:
        tournament = Tournament.objects.get(pk=tournament_id)
    except Tournament.DoesNotExist:
        return {}

    entries = TournamentEntry.objects.filter(
        tournament=tournament,
    ).select_related("player")

    rounds = TournamentRound.objects.filter(
        tournament=tournament,
        status=RoundStatus.COMPLETED,
    )

    # Aggregated per-player stats
    player_stats: dict[int, dict] = {}
    for entry in entries:
        player_stats[entry.player_id] = {
            "player_id": entry.player_id,
            "username": entry.player.username,
            "wins": 0,
            "losses": 0,
            "total_score": 0,
            "total_conceded": 0,
            "rounds_played": 0,
            "eliminated_in_round": None,
        }

    for rd in rounds:
        if rd.player1_id and rd.player1_id in player_stats:
            stats = player_stats[rd.player1_id]
            stats["rounds_played"] += 1
            stats["total_score"] += rd.player1_score
            stats["total_conceded"] += rd.player2_score
            if rd.winner_id == rd.player1_id:
                stats["wins"] += 1
            else:
                stats["losses"] += 1
                stats["eliminated_in_round"] = rd.round_number

        if rd.player2_id and rd.player2_id in player_stats:
            stats = player_stats[rd.player2_id]
            stats["rounds_played"] += 1
            stats["total_score"] += rd.player2_score
            stats["total_conceded"] += rd.player1_score
            if rd.winner_id == rd.player2_id:
                stats["wins"] += 1
            else:
                stats["losses"] += 1
                stats["eliminated_in_round"] = rd.round_number

    for pid, s in player_stats.items():
        if tournament.winner_id and pid == tournament.winner_id:
            s["placement"] = 1
        elif s["eliminated_in_round"] is not None:
            remaining_rounds = tournament.total_rounds - s["eliminated_in_round"]
            s["placement"] = (1 << remaining_rounds) + 1
        else:
            s["placement"] = None  # Still active or bye

    # Sort by placement
    rankings = sorted(
        player_stats.values(),
        key=lambda x: (x["placement"] is None, x["placement"] or 9999),
    )

    completed_rounds = rounds.count()
    total_matches = TournamentRound.objects.filter(
        tournament=tournament,
    ).exclude(status=RoundStatus.BYE).count()

    return {
        "tournament_id": str(tournament.id),
        "status": tournament.status,
        "total_rounds": tournament.total_rounds,
        "current_round": tournament.current_round,
        "completed_matches": completed_rounds,
        "total_matches": total_matches,
        "rankings": rankings,
    }


@sync_to_async
def _compute_player_stats(user_id: int) -> dict:
    """Compute aggregate tournament stats for a player."""
    from django.db.models import Count, Q, Sum

    from apps.tournaments.models import (
        RoundStatus,
        TournamentEntry,
        TournamentRound,
        TournamentStatus,
    )

    tournaments_entered = TournamentEntry.objects.filter(
        player_id=user_id,
    ).count()

    tournaments_won = TournamentEntry.objects.filter(
        player_id=user_id,
        tournament__winner_id=user_id,
        tournament__status=TournamentStatus.COMPLETED,
    ).count()

    # Match stats
    as_p1 = TournamentRound.objects.filter(
        player1_id=user_id,
        status=RoundStatus.COMPLETED,
    )
    as_p2 = TournamentRound.objects.filter(
        player2_id=user_id,
        status=RoundStatus.COMPLETED,
    )

    matches_played = as_p1.count() + as_p2.count()
    matches_won = (
        as_p1.filter(winner_id=user_id).count()
        + as_p2.filter(winner_id=user_id).count()
    )

    total_score_p1 = as_p1.aggregate(s=Sum("player1_score"))["s"] or 0
    total_score_p2 = as_p2.aggregate(s=Sum("player2_score"))["s"] or 0
    total_score = total_score_p1 + total_score_p2

    total_conceded_p1 = as_p1.aggregate(s=Sum("player2_score"))["s"] or 0
    total_conceded_p2 = as_p2.aggregate(s=Sum("player1_score"))["s"] or 0
    total_conceded = total_conceded_p1 + total_conceded_p2

    return {
        "user_id": user_id,
        "tournaments_entered": tournaments_entered,
        "tournaments_won": tournaments_won,
        "win_rate": (
            round(tournaments_won / tournaments_entered * 100, 1)
            if tournaments_entered > 0
            else 0.0
        ),
        "matches_played": matches_played,
        "matches_won": matches_won,
        "match_win_rate": (
            round(matches_won / matches_played * 100, 1)
            if matches_played > 0
            else 0.0
        ),
        "total_score": total_score,
        "total_conceded": total_conceded,
    }


def _extract_scores(session: GameSession) -> tuple[int, int]:
    """
    Extract player scores from the game engine state.

    Returns (player1_score, player2_score).
    """
    state = session.engine.get_state()

    if session.game_type == GameType.PONG:
        # Pong engine stores scores directly
        scores = state.get("scores", {})
        return (
            scores.get("player1", scores.get(1, 0)),
            scores.get("player2", scores.get(2, 0)),
        )
    else:
        # TicTacToe: winner=1, loser=0, draw=0/0
        if session.finish_reason == FinishReason.DRAW:
            return (0, 0)

        # Winner gets 1 point
        winner_slot = None
        for slot, ps in session.players.items():
            if ps.user_id == session.winner_id:
                winner_slot = slot
                break

        if winner_slot == 1:
            return (1, 0)
        elif winner_slot == 2:
            return (0, 1)
        return (0, 0)


async def _resolve_winner_from_engine(
    session: GameSession,
    tournament_round: Any,
) -> Optional[int]:
    """
    Try to determine the winner user_id from the engine when
    session.winner_id is not set (e.g. normal score win).
    """
    winner = session.engine.winner
    if winner is None:
        return None

    # For Pong, winner is a slot number (1 or 2)
    if isinstance(winner, int):
        player = session.players.get(winner)
        return player.user_id if player else None

    # For TicTacToe, winner might be "X" or "O" (slot 1 or 2)
    winner_str = str(winner)
    if hasattr(winner, "value"):
        winner_str = winner.value

    slot_map = {"X": 1, "O": 2, "x": 1, "o": 2}
    slot = slot_map.get(winner_str)
    if slot is not None:
        player = session.players.get(slot)
        return player.user_id if player else None

    return None


async def _broadcast_tournament_update(
    tournament_id: str,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """Send a tournament update to all connected tournament watchers."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("No channel layer available for tournament broadcast")
        return

    group = tournament_group_name(tournament_id)
    await channel_layer.group_send(
        group,
        {
            "type": "tournament.update",
            "event_type": event_type,
            "data": data,
        },
    )
