from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TransactionTestCase
from unittest.mock import AsyncMock, patch

from apps.games.finish_service import finalize_finished_session
from apps.games.match_recording_service import _create_match_record
from apps.games.models import Match, MatchOutcome, MatchPlayer
from apps.games.pong_engine import PongEngine
from apps.games.session import FinishReason, GameSession, GameType, PlayerSlot


User = get_user_model()


class MatchRecordingServiceTests(TransactionTestCase):
    def _record_match(
        self,
        session: GameSession,
        xp_awards=None,
    ) -> str | None:
        return _create_match_record.__wrapped__(session, xp_awards=xp_awards)

    def test_finished_match_with_no_winner_is_recorded_as_draw(self):
        user1 = User.objects.create_user(
            username="player_one",
            email="player1@example.com",
            password="StrongPass1!",
        )
        user2 = User.objects.create_user(
            username="player_two",
            email="player2@example.com",
            password="StrongPass1!",
        )

        engine = PongEngine()
        engine.player1.score = 4
        engine.player2.score = 4

        session = GameSession(
            game_id="test-no-winner-draw",
            game_type=GameType.PONG,
            engine=engine,
            players={
                1: PlayerSlot(user_id=user1.id, username=user1.username, channel_name="ch1", slot=1),
                2: PlayerSlot(user_id=user2.id, username=user2.username, channel_name="ch2", slot=2),
            },
        )
        session.mark_finished(reason=FinishReason.SCORE, winner_id=None)

        match_id = self._record_match(session)

        self.assertIsNotNone(match_id)
        match = Match.objects.get(pk=match_id)
        self.assertEqual(match.finish_reason, FinishReason.DRAW.value)
        self.assertIsNone(match.winner)

        outcomes = list(match.players.order_by("slot").values_list("outcome", flat=True))
        self.assertEqual(outcomes, [MatchOutcome.DRAW, MatchOutcome.DRAW])

    def test_finished_match_with_winner_keeps_win_loss_outcomes(self):
        user1 = User.objects.create_user(
            username="winner_one",
            email="winner1@example.com",
            password="StrongPass1!",
        )
        user2 = User.objects.create_user(
            username="loser_two",
            email="loser2@example.com",
            password="StrongPass1!",
        )

        engine = PongEngine()
        engine.player1.score = 7
        engine.player2.score = 5
        engine.winner = 1

        session = GameSession(
            game_id="test-real-winner",
            game_type=GameType.PONG,
            engine=engine,
            players={
                1: PlayerSlot(user_id=user1.id, username=user1.username, channel_name="ch1", slot=1),
                2: PlayerSlot(user_id=user2.id, username=user2.username, channel_name="ch2", slot=2),
            },
        )
        session.mark_finished(reason=FinishReason.SCORE, winner_id=user1.id)

        match_id = self._record_match(session)

        self.assertIsNotNone(match_id)
        match = Match.objects.get(pk=match_id)
        self.assertEqual(match.finish_reason, FinishReason.SCORE.value)
        self.assertEqual(match.winner_id, user1.id)

        outcomes = list(match.players.order_by("slot").values_list("outcome", flat=True))
        self.assertEqual(outcomes, [MatchOutcome.WIN, MatchOutcome.LOSS])

    def test_duplicate_recording_same_session_is_idempotent(self):
        user1 = User.objects.create_user(
            username="dupe_player_one",
            email="dupe-player1@example.com",
            password="StrongPass1!",
        )
        user2 = User.objects.create_user(
            username="dupe_player_two",
            email="dupe-player2@example.com",
            password="StrongPass1!",
        )

        engine = PongEngine()
        engine.player1.score = 7
        engine.player2.score = 2
        engine.winner = 1

        session = GameSession(
            game_id="test-duplicate-recording",
            game_type=GameType.PONG,
            engine=engine,
            players={
                1: PlayerSlot(
                    user_id=user1.id,
                    username=user1.username,
                    channel_name="ch1",
                    slot=1,
                ),
                2: PlayerSlot(
                    user_id=user2.id,
                    username=user2.username,
                    channel_name="ch2",
                    slot=2,
                ),
            },
        )
        session.mark_finished(reason=FinishReason.SCORE, winner_id=user1.id)

        first_match_id = self._record_match(
            session,
            xp_awards={user1.id: 49, user2.id: 14},
        )
        second_match_id = self._record_match(
            session,
            xp_awards={user1.id: 99, user2.id: 99},
        )

        self.assertIsNotNone(first_match_id)
        self.assertIsNone(second_match_id)
        self.assertEqual(
            Match.objects.filter(game_session_id=session.game_id).count(),
            1,
        )
        self.assertEqual(MatchPlayer.objects.filter(match_id=first_match_id).count(), 2)

        xp_values = list(
            MatchPlayer.objects.filter(match_id=first_match_id)
            .order_by("slot")
            .values_list("xp_earned", flat=True)
        )
        self.assertEqual(xp_values, [49, 14])

    def test_recording_integrity_error_returns_none(self):
        user1 = User.objects.create_user(
            username="race_player_one",
            email="race-player1@example.com",
            password="StrongPass1!",
        )
        user2 = User.objects.create_user(
            username="race_player_two",
            email="race-player2@example.com",
            password="StrongPass1!",
        )

        session = GameSession(
            game_id="test-integrity-race",
            game_type=GameType.PONG,
            engine=PongEngine(),
            players={
                1: PlayerSlot(
                    user_id=user1.id,
                    username=user1.username,
                    channel_name="ch1",
                    slot=1,
                ),
                2: PlayerSlot(
                    user_id=user2.id,
                    username=user2.username,
                    channel_name="ch2",
                    slot=2,
                ),
            },
        )
        session.mark_finished(reason=FinishReason.SCORE, winner_id=None)

        with patch(
            "apps.games.match_recording_service.Match.objects.get_or_create",
            side_effect=IntegrityError,
        ):
            self.assertIsNone(self._record_match(session))

    @patch("apps.games.finish_service.check_achievements_after_game", new_callable=AsyncMock)
    @patch("apps.games.finish_service.award_xp_after_game", new_callable=AsyncMock)
    def test_finalize_finished_session_runs_side_effects_once(
        self,
        mock_award_xp,
        mock_check_achievements,
    ):
        user1 = User.objects.create_user(
            username="finalize_player_one",
            email="finalize-player1@example.com",
            password="StrongPass1!",
        )
        user2 = User.objects.create_user(
            username="finalize_player_two",
            email="finalize-player2@example.com",
            password="StrongPass1!",
        )

        engine = PongEngine()
        engine.player1.score = 7
        engine.player2.score = 3
        engine.winner = 1

        session = GameSession(
            game_id="test-finalize-once",
            game_type=GameType.PONG,
            engine=engine,
            players={
                1: PlayerSlot(
                    user_id=user1.id,
                    username=user1.username,
                    channel_name="ch1",
                    slot=1,
                ),
                2: PlayerSlot(
                    user_id=user2.id,
                    username=user2.username,
                    channel_name="ch2",
                    slot=2,
                ),
            },
        )
        session.mark_finished(reason=FinishReason.SCORE, winner_id=user1.id)
        mock_award_xp.return_value = {user1.id: 49, user2.id: 16}

        async_to_sync(finalize_finished_session)(session)
        async_to_sync(finalize_finished_session)(session)

        self.assertEqual(mock_award_xp.await_count, 1)
        self.assertEqual(mock_check_achievements.await_count, 1)
        self.assertEqual(
            Match.objects.filter(game_session_id=session.game_id).count(),
            1,
        )

        match = Match.objects.get(game_session_id=session.game_id)
        xp_values = list(
            match.players.order_by("slot").values_list("xp_earned", flat=True)
        )
        self.assertEqual(xp_values, [49, 16])
