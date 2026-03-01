from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import (
    RoundStatus,
    Tournament,
    TournamentEntry,
    TournamentRound,
    TournamentStatus,
)
from .serializers import (
    RoundCompleteSerializer,
    TournamentCreateSerializer,
    TournamentDetailSerializer,
    TournamentEntrySerializer,
    TournamentListSerializer,
    TournamentRoundSerializer,
    TournamentUpdateSerializer,
)
from .tournament_service import (
    get_player_tournament_stats,
    get_tournament_stats,
    prepare_round_matches,
)

class TournamentListCreateView(APIView):
    """
    GET  /api/tournaments/           → list all tournaments (paginated)
    POST /api/tournaments/           → create a new tournament
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        qs = Tournament.objects.select_related("created_by", "winner").all()

        # Optional filters
        status_filter = request.query_params.get("status")
        game_type = request.query_params.get("game_type")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if game_type:
            qs = qs.filter(game_type=game_type)

        # Manual pagination (matching global PAGE_SIZE = 20)
        page = int(request.query_params.get("page", 1))
        page_size = 20
        start = (page - 1) * page_size
        end = start + page_size
        total = qs.count()

        tournaments = qs[start:end]
        serializer = TournamentListSerializer(tournaments, many=True)
        return Response({
            "count": total,
            "page": page,
            "page_size": page_size,
            "results": serializer.data,
        })

    def post(self, request):
        serializer = TournamentCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        tournament = serializer.save()

        # Auto-register the creator as participant
        TournamentEntry.objects.create(tournament=tournament, player=request.user)

        detail = TournamentDetailSerializer(tournament).data
        return Response(detail, status=status.HTTP_201_CREATED)


class TournamentDetailView(APIView):
    """
    GET    /api/tournaments/<id>/     → tournament detail with entries & bracket
    PATCH  /api/tournaments/<id>/     → update tournament (creator only, while PENDING)
    DELETE /api/tournaments/<id>/     → cancel tournament (creator only, while PENDING)
    """

    def _get_tournament(self, pk):
        try:
            return Tournament.objects.select_related("created_by", "winner").get(pk=pk)
        except Tournament.DoesNotExist:
            return None

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request, pk):
        tournament = self._get_tournament(pk)
        if not tournament:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = TournamentDetailSerializer(tournament)
        return Response(serializer.data)

    def patch(self, request, pk):
        tournament = self._get_tournament(pk)
        if not tournament:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if tournament.created_by_id != request.user.id:
            return Response(
                {"detail": "Only the creator can update this tournament."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if tournament.status != TournamentStatus.PENDING:
            return Response(
                {"detail": "Cannot update a tournament that has already started."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = TournamentUpdateSerializer(
            data=request.data,
            context={"request": request, "tournament": tournament},
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(tournament, serializer.validated_data)
        return Response(TournamentDetailSerializer(tournament).data)

    def delete(self, request, pk):
        tournament = self._get_tournament(pk)
        if not tournament:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if tournament.created_by_id != request.user.id:
            return Response(
                {"detail": "Only the creator can cancel this tournament."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if tournament.status not in (TournamentStatus.PENDING, TournamentStatus.IN_PROGRESS):
            return Response(
                {"detail": "Cannot cancel a completed or already-cancelled tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tournament.status = TournamentStatus.CANCELLED
        tournament.save(update_fields=["status", "updated_at"])
        return Response(
            {"detail": "Tournament cancelled."},
            status=status.HTTP_200_OK,
        )

class TournamentJoinView(APIView):
    """POST /api/tournaments/<id>/join/ → register current user as participant."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not tournament.is_joinable:
            if tournament.status != TournamentStatus.PENDING:
                msg = "Tournament is no longer accepting registrations."
            else:
                msg = "Tournament is full."
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        if TournamentEntry.objects.filter(
            tournament=tournament, player=request.user
        ).exists():
            return Response(
                {"detail": "You are already registered for this tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry = TournamentEntry.objects.create(
            tournament=tournament, player=request.user
        )
        serializer = TournamentEntrySerializer(entry)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TournamentLeaveView(APIView):
    """POST /api/tournaments/<id>/leave/ → unregister current user."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tournament.status != TournamentStatus.PENDING:
            return Response(
                {"detail": "Cannot leave a tournament that has already started."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = TournamentEntry.objects.filter(
            tournament=tournament, player=request.user
        ).delete()

        if not deleted:
            return Response(
                {"detail": "You are not registered for this tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"detail": "Successfully left the tournament."},
            status=status.HTTP_200_OK,
        )


class TournamentParticipantsView(APIView):
    """GET /api/tournaments/<id>/participants/ → list participants."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        entries = tournament.entries.select_related("player").all()
        serializer = TournamentEntrySerializer(entries, many=True)
        return Response(serializer.data)

class TournamentStartView(APIView):
    """POST /api/tournaments/<id>/start/ → generate bracket and start."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tournament.created_by_id != request.user.id:
            return Response(
                {"detail": "Only the creator can start the tournament."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            tournament.generate_bracket()
        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Auto-prepare game sessions for first-round matches
        import asyncio
        loop = asyncio.new_event_loop()
        try:
            matches = loop.run_until_complete(
                prepare_round_matches(str(tournament.id))
            )
        finally:
            loop.close()

        data = TournamentDetailSerializer(tournament).data
        data["prepared_matches"] = matches
        return Response(data, status=status.HTTP_200_OK)


class TournamentBracketView(APIView):
    """GET /api/tournaments/<id>/bracket/ → full bracket (all rounds)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        rounds = (
            TournamentRound.objects.filter(tournament=tournament)
            .select_related("player1", "player2", "winner")
            .order_by("round_number", "match_index")
        )
        serializer = TournamentRoundSerializer(rounds, many=True)

        return Response({
            "tournament_id": str(tournament.id),
            "total_rounds": tournament.total_rounds,
            "current_round": tournament.current_round,
            "status": tournament.status,
            "bracket": serializer.data,
        })

class TournamentRoundCompleteView(APIView):
    """
    POST /api/tournaments/<tid>/rounds/<rid>/complete/

    Mark a bracket match as completed and advance the winner.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, tournament_pk, round_pk):
        try:
            tournament = Tournament.objects.get(pk=tournament_pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tournament.status != TournamentStatus.IN_PROGRESS:
            return Response(
                {"detail": "Tournament is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            round_obj = TournamentRound.objects.select_related(
                "player1", "player2"
            ).get(pk=round_pk, tournament=tournament)
        except TournamentRound.DoesNotExist:
            return Response(
                {"detail": "Round not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if round_obj.status == RoundStatus.COMPLETED:
            return Response(
                {"detail": "This round has already been completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if round_obj.status == RoundStatus.BYE:
            return Response(
                {"detail": "This round is a bye and was auto-completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = RoundCompleteSerializer(
            data=request.data, context={"round": round_obj}
        )
        serializer.is_valid(raise_exception=True)

        # Complete the round
        round_obj.complete(
            winner_id=serializer.validated_data["winner_id"],
            p1_score=serializer.validated_data["player1_score"],
            p2_score=serializer.validated_data["player2_score"],
        )

        # Advance winner to next round
        next_round = tournament.advance_winner(round_obj)

        # Refresh tournament from DB to get latest status
        tournament.refresh_from_db()

        response_data = {
            "completed_round": TournamentRoundSerializer(round_obj).data,
            "tournament_status": tournament.status,
        }

        if next_round:
            next_round.refresh_from_db()
            response_data["next_round"] = TournamentRoundSerializer(next_round).data
        else:
            response_data["next_round"] = None
            if tournament.winner:
                from apps.accounts.serializers import UserProfileSerializer
                response_data["tournament_winner"] = UserProfileSerializer(
                    tournament.winner
                ).data

        return Response(response_data)

class MyTournamentsView(APIView):
    """GET /api/tournaments/me/ → tournaments the current user is in."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tournament_ids = TournamentEntry.objects.filter(
            player=request.user,
        ).values_list("tournament_id", flat=True)

        qs = (
            Tournament.objects.filter(id__in=tournament_ids)
            .select_related("created_by", "winner")
            .order_by("-created_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        serializer = TournamentListSerializer(qs, many=True)
        return Response(serializer.data)

class TournamentStatsView(APIView):
    """GET /api/tournaments/<id>/stats/ → tournament statistics & rankings."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        import asyncio

        try:
            Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Run async service function from sync view
        loop = asyncio.new_event_loop()
        try:
            stats = loop.run_until_complete(get_tournament_stats(str(pk)))
        finally:
            loop.close()

        return Response(stats)


class PlayerTournamentStatsView(APIView):
    """GET /api/tournaments/stats/me/ → current user's tournament stats."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            stats = loop.run_until_complete(
                get_player_tournament_stats(request.user.id)
            )
        finally:
            loop.close()

        return Response(stats)

class TournamentPrepareRoundView(APIView):
    """
    POST /api/tournaments/<id>/prepare-round/

    Create game sessions for all ready matches in the current round.
    Only the tournament creator can trigger this.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        import asyncio

        try:
            tournament = Tournament.objects.get(pk=pk)
        except Tournament.DoesNotExist:
            return Response(
                {"detail": "Tournament not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if tournament.created_by_id != request.user.id:
            return Response(
                {"detail": "Only the creator can prepare rounds."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if tournament.status != TournamentStatus.IN_PROGRESS:
            return Response(
                {"detail": "Tournament is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        loop = asyncio.new_event_loop()
        try:
            matches = loop.run_until_complete(
                prepare_round_matches(str(pk))
            )
        finally:
            loop.close()

        return Response({
            "matches_created": len(matches),
            "matches": matches,
        })
