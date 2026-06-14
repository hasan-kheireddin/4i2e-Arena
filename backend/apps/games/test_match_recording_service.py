from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.games.match_recording_service import _create_match_record
from apps.games.models import Match, MatchOutcome
from apps.games.pong_engine import PongEngine
from apps.games.session import FinishReason, GameSession, GameType, PlayerSlot


User = get_user_model()


class MatchRecordingServiceTests(TestCase):
    def _record_match(self, session: GameSession) -> str | None:
        return _create_match_record.__wrapped__(session)

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
