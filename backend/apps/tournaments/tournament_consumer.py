from __future__ import annotations
import logging
from typing import Any
from asgiref.sync import sync_to_async
from apps.games.consumers import BaseConsumer
from apps.tournaments.tournament_service import (
    create_tournament_game_session,
    get_tournament_stats,
    prepare_round_matches,
    tournament_group_name,
)

logger = logging.getLogger("tournaments.consumer")


class TournamentConsumer(BaseConsumer):
    """WebSocket consumer for real-time tournament bracket updates."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._tournament_id: str | None = None
        self._group: str | None = None

    async def on_connect(self) -> None:
        """
        Extract tournament_id from the URL and join the tournament
        channel group for real-time updates.
        """
        self._tournament_id = self.scope["url_route"]["kwargs"].get("tournament_id")
        if not self._tournament_id:
            await self.send_error("invalid_tournament", "Missing tournament_id in URL")
            await self.close(code=4400)
            return

        # Verify tournament exists
        exists = await self._tournament_exists(self._tournament_id)
        if not exists:
            await self.send_error("tournament_not_found", "Tournament does not exist")
            await self.close(code=4404)
            return

        self._group = tournament_group_name(self._tournament_id)
        await self.join_group(self._group)

        logger.info(
            "User %s subscribed to tournament %s",
            getattr(self.user, "username", "anon"),
            self._tournament_id,
        )

        # Send current bracket state on connect
        await self._send_bracket()

    async def on_disconnect(self, code: int) -> None:
        """Leave the tournament group on disconnect."""
        if self._group:
            await self.leave_group(self._group)

    async def on_message(self, content: dict[str, Any]) -> None:
        msg_type = content.get("type", "")

        if msg_type == "prepare_match":
            await self._handle_prepare_match(content)
        elif msg_type == "get_stats":
            await self._handle_get_stats()
        elif msg_type == "get_bracket":
            await self._send_bracket()
        elif msg_type == "prepare_round":
            await self._handle_prepare_round()
        else:
            await self.send_error(
                "unknown_type", f"Unknown message type: {msg_type}"
            )

    async def _handle_prepare_match(self, content: dict[str, Any]) -> None:
        """Create a game session for a specific tournament round."""
        round_id = content.get("round_id")
        if not round_id:
            await self.send_error("missing_round_id", "round_id is required")
            return

        # Get tournament game type
        game_type = await self._get_tournament_game_type(self._tournament_id)
        if not game_type:
            await self.send_error("tournament_not_found", "Tournament not found")
            return

        game_id = await create_tournament_game_session(round_id, game_type)

        if game_id is None:
            await self.send_error(
                "match_not_ready",
                "Match is not ready (players missing or already started)",
            )
            return

        # Notify everyone in the tournament
        round_data = await self._get_round_info(round_id)

        await self.broadcast(
            self._group,
            {
                "round_id": str(round_id),
                "game_id": game_id,
                "player1_id": round_data.get("player1_id") if round_data else None,
                "player2_id": round_data.get("player2_id") if round_data else None,
                "game_type": game_type,
            },
            handler="match.created",
        )

    async def _handle_prepare_round(self) -> None:
        """Prepare all matches in the current round."""
        if not self._tournament_id:
            return

        matches = await prepare_round_matches(self._tournament_id)

        for match in matches:
            await self.broadcast(
                self._group,
                {
                    "round_id": match["round_id"],
                    "game_id": match["game_id"],
                    "player1_id": match["player1_id"],
                    "player2_id": match["player2_id"],
                },
                handler="match.created",
            )

        await self.send_json({
            "type": "round_prepared",
            "matches_created": len(matches),
        })

    async def _handle_get_stats(self) -> None:
        """Send tournament statistics to the requesting client."""
        if not self._tournament_id:
            return

        stats = await get_tournament_stats(self._tournament_id)
        await self.send_json({
            "type": "stats",
            "stats": stats,
        })

    async def _send_bracket(self) -> None:
        """Send the full bracket to the requesting client."""
        if not self._tournament_id:
            return

        bracket = await self._get_bracket(self._tournament_id)
        await self.send_json({
            "type": "bracket",
            **bracket,
        })

    async def tournament_update(self, event: dict[str, Any]) -> None:
        """Forward tournament update events (from tournament_service)."""
        await self.send_json({
            "type": "tournament_update",
            "event_type": event.get("event_type"),
            "data": event.get("data"),
        })

    async def match_created(self, event: dict[str, Any]) -> None:
        """Forward match_created events."""
        await self.send_json({
            "type": "match_created",
            "round_id": event.get("round_id"),
            "game_id": event.get("game_id"),
            "player1_id": event.get("player1_id"),
            "player2_id": event.get("player2_id"),
            "game_type": event.get("game_type"),
        })

    @staticmethod
    @sync_to_async
    def _tournament_exists(tournament_id: str) -> bool:
        from apps.tournaments.models import Tournament
        return Tournament.objects.filter(pk=tournament_id).exists()

    @staticmethod
    @sync_to_async
    def _get_tournament_game_type(tournament_id: str) -> str | None:
        from apps.tournaments.models import Tournament
        try:
            return Tournament.objects.values_list("game_type", flat=True).get(
                pk=tournament_id
            )
        except Tournament.DoesNotExist:
            return None

    @staticmethod
    @sync_to_async
    def _get_bracket(tournament_id: str) -> dict:
        from apps.tournaments.models import Tournament, TournamentRound
        from apps.tournaments.serializers import TournamentRoundSerializer

        try:
            tournament = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return {"bracket": [], "total_rounds": 0, "current_round": 0}

        rounds = (
            TournamentRound.objects.filter(tournament=tournament)
            .select_related("player1", "player2", "winner")
            .order_by("round_number", "match_index")
        )
        serializer = TournamentRoundSerializer(rounds, many=True)

        return {
            "tournament_id": str(tournament.id),
            "status": tournament.status,
            "total_rounds": tournament.total_rounds,
            "current_round": tournament.current_round,
            "bracket": serializer.data,
        }

    @staticmethod
    @sync_to_async
    def _get_round_info(round_id: str) -> dict | None:
        from apps.tournaments.models import TournamentRound

        try:
            rd = TournamentRound.objects.get(pk=round_id)
            return {
                "player1_id": rd.player1_id,
                "player2_id": rd.player2_id,
                "round_number": rd.round_number,
                "match_index": rd.match_index,
            }
        except TournamentRound.DoesNotExist:
            return None
