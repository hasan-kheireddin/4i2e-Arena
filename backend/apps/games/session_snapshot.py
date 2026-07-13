from __future__ import annotations

import time
import uuid
from typing import Any

from apps.games.pong_engine import PaddleDirection, PongEngine
from apps.games.session_models import (
    FinishReason,
    GameSession,
    GameType,
    PlayerSlot,
    SessionStatus,
)
from apps.games.tictactoe_engine import Mark, TicTacToeEngine


def _deserialize_int_dict(raw: Any) -> dict[int, int]:
    if not isinstance(raw, dict):
        return {}

    out: dict[int, int] = {}
    for key, value in raw.items():
        try:
            out[int(key)] = int(value)
        except (TypeError, ValueError):
            continue
    return out


def _deserialize_bool_dict(raw: Any) -> dict[int, bool]:
    if not isinstance(raw, dict):
        return {}

    out: dict[int, bool] = {}
    for key, value in raw.items():
        try:
            out[int(key)] = bool(value)
        except (TypeError, ValueError):
            continue
    return out


def _deserialize_float_list_dict(raw: Any) -> dict[int, list[float]]:
    if not isinstance(raw, dict):
        return {}

    out: dict[int, list[float]] = {}
    for key, value in raw.items():
        try:
            slot = int(key)
        except (TypeError, ValueError):
            continue

        if not isinstance(value, list):
            continue

        out[slot] = [
            float(item)
            for item in value
            if isinstance(item, (int, float))
        ]
    return out


def _serialize_engine(game_type: GameType, engine: Any) -> dict[str, Any]:
    if game_type == GameType.PONG and isinstance(engine, PongEngine):
        return {
            "status": engine.status.value,
            "tick_count": engine.tick_count,
            "serve_cooldown": engine.serve_cooldown,
            "winner": engine.winner,
            "last_scorer": engine.last_scorer,
            "started_at": engine.started_at,
            "finished_at": engine.finished_at,
            "ball": {
                "x": engine.ball.x,
                "y": engine.ball.y,
                "vx": engine.ball.vx,
                "vy": engine.ball.vy,
                "speed": engine.ball.speed,
            },
            "player1": {
                "score": engine.player1.score,
                "paddle_y": engine.player1.paddle.y,
                "direction": engine.player1.paddle.direction.value,
                "player_id": engine.player1.player_id,
            },
            "player2": {
                "score": engine.player2.score,
                "paddle_y": engine.player2.paddle.y,
                "direction": engine.player2.paddle.direction.value,
                "player_id": engine.player2.player_id,
            },
            "stats": {
                "current_rally_hits": engine.current_rally_hits,
                "max_rally_hits": engine.max_rally_hits,
                "player_hits": engine.player_hits,
                "player_current_consecutive_blocks": (
                    engine.player_current_consecutive_blocks
                ),
                "player_max_consecutive_blocks": engine.player_max_consecutive_blocks,
                "player_misses": engine.player_misses,
                "player_max_deficit": engine.player_max_deficit,
                "player_scored_three_under_ten": (
                    engine.player_scored_three_under_ten
                ),
                "player_point_timestamps": engine.player_point_timestamps,
            },
        }

    if game_type == GameType.TICTACTOE and isinstance(engine, TicTacToeEngine):
        return {
            "status": engine.status.value,
            "board": [
                cell.value if cell is not None else None
                for cell in engine.board
            ],
            "current_turn": engine.current_turn.value,
            "move_count": engine.move_count,
            "winner": engine.winner.value if engine.winner is not None else None,
            "is_draw": engine.is_draw,
            "winning_line": (
                list(engine.winning_line)
                if engine.winning_line is not None
                else None
            ),
            "player1_id": engine.player1_id,
            "player2_id": engine.player2_id,
            "started_at": engine.started_at,
            "finished_at": engine.finished_at,
            "stats": {
                "player_block_counts": engine.player_block_counts,
            },
        }

    raise ValueError(f"Unsupported game engine for serialization: {game_type}")


def _deserialize_pong_player(payload: Any, player: Any) -> None:
    if not isinstance(payload, dict):
        return

    player.score = int(payload.get("score", player.score))
    player.paddle.y = float(payload.get("paddle_y", player.paddle.y))

    direction_raw = payload.get("direction")
    if isinstance(direction_raw, str):
        try:
            player.paddle.direction = PaddleDirection(direction_raw)
        except ValueError:
            pass

    player_id = payload.get("player_id")
    player.player_id = str(player_id) if player_id is not None else None


def _deserialize_pong_stats(payload: Any, engine: PongEngine) -> None:
    if not isinstance(payload, dict):
        return

    engine.current_rally_hits = int(payload.get("current_rally_hits", 0))
    engine.max_rally_hits = int(payload.get("max_rally_hits", 0))
    engine.player_hits = {
        1: 0,
        2: 0,
        **_deserialize_int_dict(payload.get("player_hits")),
    }
    engine.player_current_consecutive_blocks = {
        1: 0,
        2: 0,
        **_deserialize_int_dict(payload.get("player_current_consecutive_blocks")),
    }
    engine.player_max_consecutive_blocks = {
        1: 0,
        2: 0,
        **_deserialize_int_dict(payload.get("player_max_consecutive_blocks")),
    }
    engine.player_misses = {
        1: 0,
        2: 0,
        **_deserialize_int_dict(payload.get("player_misses")),
    }
    engine.player_max_deficit = {
        1: 0,
        2: 0,
        **_deserialize_int_dict(payload.get("player_max_deficit")),
    }
    engine.player_scored_three_under_ten = {
        1: False,
        2: False,
        **_deserialize_bool_dict(payload.get("player_scored_three_under_ten")),
    }
    engine.player_point_timestamps = {
        1: [],
        2: [],
        **_deserialize_float_list_dict(payload.get("player_point_timestamps")),
    }


def _deserialize_pong_engine(payload: dict[str, Any]) -> PongEngine:
    engine = PongEngine()

    status_raw = payload.get("status")
    if isinstance(status_raw, str):
        try:
            engine.status = engine.status.__class__(status_raw)
        except ValueError:
            pass

    engine.tick_count = int(payload.get("tick_count", 0))
    engine.serve_cooldown = int(payload.get("serve_cooldown", 0))

    winner_raw = payload.get("winner")
    engine.winner = winner_raw if winner_raw in (1, 2) else None

    scorer_raw = payload.get("last_scorer")
    engine.last_scorer = scorer_raw if scorer_raw in (1, 2) else None

    engine.started_at = payload.get("started_at")
    engine.finished_at = payload.get("finished_at")

    ball = payload.get("ball")
    if isinstance(ball, dict):
        engine.ball.x = float(ball.get("x", engine.ball.x))
        engine.ball.y = float(ball.get("y", engine.ball.y))
        engine.ball.vx = float(ball.get("vx", engine.ball.vx))
        engine.ball.vy = float(ball.get("vy", engine.ball.vy))
        engine.ball.speed = float(ball.get("speed", engine.ball.speed))

    _deserialize_pong_player(payload.get("player1"), engine.player1)
    _deserialize_pong_player(payload.get("player2"), engine.player2)
    _deserialize_pong_stats(payload.get("stats"), engine)

    return engine


def _deserialize_ttt_board(raw: Any) -> list[Mark | None] | None:
    if not isinstance(raw, list) or len(raw) != 9:
        return None

    board: list[Mark | None] = []
    for cell in raw:
        board.append(Mark(cell) if cell in ("X", "O") else None)
    return board


def _deserialize_ttt_winning_line(raw: Any) -> tuple[int, int, int] | None:
    if not isinstance(raw, list) or len(raw) != 3:
        return None
    if not all(isinstance(index, int) for index in raw):
        return None
    return (raw[0], raw[1], raw[2])


def _deserialize_ttt_block_counts(raw: Any) -> dict[int, int] | None:
    if not isinstance(raw, dict):
        return None

    block_counts: dict[int, int] = {1: 0, 2: 0}
    for key, value in raw.items():
        try:
            block_counts[int(key)] = int(value)
        except (TypeError, ValueError):
            continue
    return block_counts


def _deserialize_ttt_engine(payload: dict[str, Any]) -> TicTacToeEngine:
    engine = TicTacToeEngine()

    status_raw = payload.get("status")
    if isinstance(status_raw, str):
        try:
            engine.status = engine.status.__class__(status_raw)
        except ValueError:
            pass

    board = _deserialize_ttt_board(payload.get("board"))
    if board is not None:
        engine.board = board

    turn_raw = payload.get("current_turn")
    if turn_raw in ("X", "O"):
        engine.current_turn = Mark(turn_raw)

    engine.move_count = int(payload.get("move_count", engine.move_count))

    winner_raw = payload.get("winner")
    engine.winner = Mark(winner_raw) if winner_raw in ("X", "O") else None
    engine.is_draw = bool(payload.get("is_draw", False))
    engine.winning_line = _deserialize_ttt_winning_line(payload.get("winning_line"))

    player1_id = payload.get("player1_id")
    player2_id = payload.get("player2_id")
    engine.player1_id = str(player1_id) if player1_id is not None else None
    engine.player2_id = str(player2_id) if player2_id is not None else None
    engine.started_at = payload.get("started_at")
    engine.finished_at = payload.get("finished_at")

    stats = payload.get("stats")
    if isinstance(stats, dict):
        block_counts = _deserialize_ttt_block_counts(stats.get("player_block_counts"))
        if block_counts is not None:
            engine.player_block_counts = block_counts

    return engine


def serialize_session(session: GameSession) -> dict[str, Any]:
    return {
        "version": 1,
        "game_id": session.game_id,
        "game_type": session.game_type.value,
        "status": session.status.value,
        "group_name": session.group_name,
        "created_at": session.created_at,
        "finished_at": session.finished_at,
        "finish_reason": (
            session.finish_reason.value
            if session.finish_reason is not None
            else None
        ),
        "winner_id": str(session.winner_id) if session.winner_id is not None else None,
        "paused": session.paused,
        "pause_reason": session.pause_reason,
        "both_connected_sent": session.both_connected_sent,
        "ready_slots": sorted(int(slot) for slot in session.ready_slots),
        "authorized_player_ids": sorted(session.authorized_player_ids),
        "players": {
            str(slot): {
                "user_id": str(player.user_id),
                "username": player.username,
                "channel_name": player.channel_name,
                "slot": player.slot,
                "connected": player.connected,
                "disconnected_at": player.disconnected_at,
            }
            for slot, player in session.players.items()
        },
        "engine": _serialize_engine(session.game_type, session.engine),
    }


def _deserialize_session_engine(
    game_type: GameType,
    engine_payload: Any,
) -> Any:
    payload = engine_payload if isinstance(engine_payload, dict) else {}

    if game_type == GameType.PONG:
        return _deserialize_pong_engine(payload)
    if game_type == GameType.TICTACTOE:
        return _deserialize_ttt_engine(payload)
    raise ValueError(f"Unsupported game type in snapshot: {game_type}")


def _deserialize_session_status(raw: Any) -> SessionStatus:
    if not isinstance(raw, str):
        return SessionStatus.WAITING

    try:
        return SessionStatus(raw)
    except ValueError:
        return SessionStatus.WAITING


def _deserialize_finish_reason(raw: Any) -> FinishReason | None:
    if not isinstance(raw, str):
        return None

    try:
        return FinishReason(raw)
    except ValueError:
        return None


def _deserialize_user_id(raw: Any) -> int | str | uuid.UUID | None:
    if isinstance(raw, int):
        return raw
    if not isinstance(raw, str):
        return None

    try:
        return uuid.UUID(raw)
    except ValueError:
        return raw


def _deserialize_ready_slots(raw: Any) -> set[int]:
    if not isinstance(raw, list):
        return set()
    return {int(slot) for slot in raw if isinstance(slot, int)}


def _deserialize_player_slot(
    slot_key: Any,
    value: Any,
) -> tuple[int, PlayerSlot] | None:
    if not isinstance(value, dict):
        return None

    try:
        slot = int(slot_key)
    except (TypeError, ValueError):
        return None

    user_id = _deserialize_user_id(value.get("user_id"))
    if user_id is None:
        return None

    username = value.get("username")
    if not isinstance(username, str):
        return None

    disconnected_at_raw = value.get("disconnected_at")
    disconnected_at = (
        float(disconnected_at_raw)
        if isinstance(disconnected_at_raw, (int, float))
        else None
    )
    channel_name = value.get("channel_name")

    return slot, PlayerSlot(
        user_id=user_id,
        username=username,
        channel_name=str(channel_name) if isinstance(channel_name, str) else "",
        slot=slot,
        connected=bool(value.get("connected", False)),
        disconnected_at=disconnected_at,
    )


def _deserialize_players(raw: Any) -> dict[int, PlayerSlot]:
    if not isinstance(raw, dict):
        return {}

    players: dict[int, PlayerSlot] = {}
    for slot_key, value in raw.items():
        player = _deserialize_player_slot(slot_key, value)
        if player is None:
            continue
        slot, player_slot = player
        players[slot] = player_slot
    return players


def deserialize_session(payload: dict[str, Any]) -> GameSession:
    game_id = str(payload["game_id"])
    game_type = GameType(str(payload["game_type"]))
    engine = _deserialize_session_engine(game_type, payload.get("engine"))

    session = GameSession(game_id=game_id, game_type=game_type, engine=engine)
    session.group_name = str(payload.get("group_name", f"game_{game_id}"))
    session.status = _deserialize_session_status(payload.get("status"))
    session.created_at = float(payload.get("created_at", session.created_at))

    finished_at = payload.get("finished_at")
    session.finished_at = (
        float(finished_at)
        if isinstance(finished_at, (int, float))
        else None
    )

    session.finish_reason = _deserialize_finish_reason(payload.get("finish_reason"))
    session.winner_id = _deserialize_user_id(payload.get("winner_id"))
    session.paused = bool(payload.get("paused", False))

    pause_reason = payload.get("pause_reason")
    session.pause_reason = str(pause_reason) if isinstance(pause_reason, str) else None

    session.both_connected_sent = bool(payload.get("both_connected_sent", False))
    session.ready_slots = _deserialize_ready_slots(payload.get("ready_slots"))
    authorized = payload.get("authorized_player_ids")
    session.authorized_player_ids = (
        {str(value) for value in authorized if isinstance(value, (str, int))}
        if isinstance(authorized, list)
        else set()
    )
    session.players = _deserialize_players(payload.get("players"))

    return session


def prepare_recovered_session(session: GameSession) -> GameSession:
    if session.status in (SessionStatus.WAITING, SessionStatus.PLAYING):
        now = time.time()
        for player in session.players.values():
            player.connected = False
            player.channel_name = ""
            if player.disconnected_at is None:
                player.disconnected_at = now

        if session.status == SessionStatus.PLAYING:
            session.paused = True
            if session.pause_reason is None:
                session.pause_reason = "server_recovery"

    session.tick_task = None
    session.tick_owner = None
    session.disconnect_tasks = {}
    return session
