from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.games.models import FinishReason, GameMode, GameType, Match, MatchPlayer
from apps.games.models import MatchOutcome


User = get_user_model()

LOC_MEM_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "games-api-tests",
    }
}


@override_settings(CACHES=LOC_MEM_CACHE)
class GameStatsApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="StatsPlayer",
            email="stats@example.com",
            password="StrongPass1!",
        )
        self.opponent = User.objects.create_user(
            username="StatsOpponent",
            email="stats-opponent@example.com",
            password="StrongPass1!",
        )
        self.viewer = User.objects.create_user(
            username="StatsViewer",
            email="stats-viewer@example.com",
            password="StrongPass1!",
        )

    def _create_match(
        self,
        session_id,
        player1,
        player2=None,
        *,
        game_type=GameType.PONG,
        game_mode=GameMode.PVP,
        winner=None,
        player1_score=7,
        player2_score=4,
        ai_difficulty="",
    ):
        now = timezone.now()
        finish_reason = FinishReason.DRAW if winner is None else FinishReason.SCORE
        match = Match.objects.create(
            game_session_id=session_id,
            game_type=game_type,
            game_mode=game_mode,
            finish_reason=finish_reason,
            winner=winner,
            started_at=now - timedelta(seconds=60),
            finished_at=now,
            duration_seconds=60,
            player1_score=player1_score,
            player2_score=player2_score,
            ai_difficulty=ai_difficulty,
            metadata={},
        )
        if winner is None:
            p1_outcome = p2_outcome = MatchOutcome.DRAW
        elif winner == player1:
            p1_outcome = MatchOutcome.WIN
            p2_outcome = MatchOutcome.LOSS
        else:
            p1_outcome = MatchOutcome.LOSS
            p2_outcome = MatchOutcome.WIN

        MatchPlayer.objects.create(
            match=match,
            user=player1,
            slot=1,
            outcome=p1_outcome,
            score=player1_score,
        )
        if player2 is not None:
            MatchPlayer.objects.create(
                match=match,
                user=player2,
                slot=2,
                outcome=p2_outcome,
                score=player2_score,
            )
        return match

    def test_head_to_head_returns_shared_match_data(self):
        match = self._create_match(
            "online-h2h-shared",
            self.user,
            self.opponent,
            winner=self.user,
            player1_score=7,
            player2_score=3,
        )
        self.client.force_authenticate(user=self.user)

        response = self.client.get(
            f"/api/games/stats/head-to-head/{self.opponent.id}/",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user_id"], str(self.user.id))
        self.assertEqual(data["opponent_id"], str(self.opponent.id))
        self.assertEqual(data["total_matches"], 1)
        self.assertEqual(data["user_wins"], 1)
        self.assertEqual(data["opponent_wins"], 0)
        self.assertEqual(data["scores"]["user_total"], 7)
        self.assertEqual(data["scores"]["opponent_total"], 3)
        self.assertEqual(data["recent_matches"][0]["match_id"], str(match.id))
        self.assertEqual(data["recent_matches"][0]["game_type"], GameType.PONG)
        self.assertEqual(data["recent_matches"][0]["outcome"], MatchOutcome.WIN)
        self.assertEqual(data["recent_matches"][0]["score"], 7)

    def test_head_to_head_cache_is_perspective_specific(self):
        self._create_match(
            "online-h2h-perspective",
            self.user,
            self.opponent,
            winner=self.user,
            player1_score=7,
            player2_score=2,
        )

        self.client.force_authenticate(user=self.user)
        first = self.client.get(
            f"/api/games/stats/head-to-head/{self.opponent.id}/",
        )
        self.client.force_authenticate(user=self.opponent)
        second = self.client.get(
            f"/api/games/stats/head-to-head/{self.user.id}/",
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        first_data = first.json()
        second_data = second.json()
        self.assertEqual(first_data["user_id"], str(self.user.id))
        self.assertEqual(first_data["opponent_id"], str(self.opponent.id))
        self.assertEqual(first_data["user_wins"], 1)
        self.assertEqual(first_data["opponent_wins"], 0)
        self.assertEqual(second_data["user_id"], str(self.opponent.id))
        self.assertEqual(second_data["opponent_id"], str(self.user.id))
        self.assertEqual(second_data["user_wins"], 0)
        self.assertEqual(second_data["opponent_wins"], 1)

    def test_head_to_head_cache_updates_after_new_match(self):
        self.client.force_authenticate(user=self.user)
        initial = self.client.get(
            f"/api/games/stats/head-to-head/{self.opponent.id}/",
        )
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.json()["total_matches"], 0)

        with self.captureOnCommitCallbacks(execute=True):
            self._create_match(
                "online-h2h-cache-refresh",
                self.user,
                self.opponent,
                winner=self.opponent,
                player1_score=2,
                player2_score=7,
            )

        refreshed = self.client.get(
            f"/api/games/stats/head-to-head/{self.opponent.id}/",
        )

        self.assertEqual(refreshed.status_code, 200)
        data = refreshed.json()
        self.assertEqual(data["total_matches"], 1)
        self.assertEqual(data["user_wins"], 0)
        self.assertEqual(data["opponent_wins"], 1)

    def test_public_stats_exclude_ai_and_local_matches(self):
        self._create_match(
            "online-public-pvp",
            self.user,
            self.opponent,
            winner=self.user,
            player1_score=7,
            player2_score=3,
        )
        self._create_match(
            "ai-public-hidden",
            self.user,
            None,
            game_mode=GameMode.PVA,
            winner=self.user,
            player1_score=7,
            player2_score=4,
            ai_difficulty="medium",
        )
        self._create_match(
            "local-public-hidden",
            self.user,
            None,
            winner=self.user,
            player1_score=7,
            player2_score=4,
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.get(f"/api/games/stats/user/{self.user.id}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["overview"]["total_matches"], 1)
        self.assertEqual(data["overview"]["wins"], 1)
        self.assertEqual(set(data["by_game_mode"].keys()), {"pvp"})

    def test_public_match_history_only_returns_public_pvp_matches(self):
        public_match = self._create_match(
            "online-history-public",
            self.user,
            self.opponent,
            winner=self.user,
            player1_score=7,
            player2_score=3,
        )
        local_match = self._create_match(
            "local-history-hidden",
            self.user,
            None,
            winner=self.user,
            player1_score=7,
            player2_score=4,
        )
        ai_match = self._create_match(
            "ai-history-hidden",
            self.user,
            None,
            game_mode=GameMode.PVA,
            winner=self.user,
            player1_score=7,
            player2_score=4,
            ai_difficulty="hard",
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.get(f"/api/games/matches/user/{self.user.id}/")

        self.assertEqual(response.status_code, 200)
        results = response.json()["results"]
        result_ids = {row["id"] for row in results}
        self.assertEqual(result_ids, {str(public_match.id)})
        self.assertNotIn(str(local_match.id), result_ids)
        self.assertNotIn(str(ai_match.id), result_ids)
        self.assertFalse(
            any(row["game_session_id"].startswith("local-") for row in results),
        )


@override_settings(CACHES=LOC_MEM_CACHE)
class CreateLocalMatchApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="LocalPlayer",
            email="local@example.com",
            password="StrongPass1!",
        )
        self.client.force_authenticate(user=self.user)

    def _payload(self, **overrides):
        payload = {
            "game_type": "pong",
            "game_mode": "pvp",
            "winner": "X",
            "duration_seconds": 45,
            "player1_score": 7,
            "player2_score": 3,
            "metadata": {
                "local_players": {
                    "player1_name": "Player A",
                    "player2_name": "Player B",
                }
            },
        }
        payload.update(overrides)
        return payload

    def test_invalid_numeric_input_returns_400(self):
        response = self.client.post(
            "/api/games/matches/create/",
            self._payload(duration_seconds="not-a-number"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("duration_seconds", response.json())
        self.assertEqual(Match.objects.count(), 0)
        self.assertEqual(MatchPlayer.objects.count(), 0)

    def test_invalid_winner_returns_400(self):
        response = self.client.post(
            "/api/games/matches/create/",
            self._payload(winner="Z"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("winner", response.json())
        self.assertEqual(Match.objects.count(), 0)
        self.assertEqual(MatchPlayer.objects.count(), 0)

    def test_valid_local_match_with_player_a_winner(self):
        response = self.client.post(
            "/api/games/matches/create/",
            self._payload(winner="X", player1_score=7, player2_score=3),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        match = Match.objects.get()
        player = MatchPlayer.objects.get(match=match)
        self.assertTrue(match.game_session_id.startswith("local-"))
        self.assertEqual(match.finish_reason, FinishReason.SCORE)
        self.assertEqual(match.winner_id, self.user.id)
        self.assertEqual(player.outcome, MatchOutcome.WIN)

    def test_valid_local_match_with_player_b_winner(self):
        response = self.client.post(
            "/api/games/matches/create/",
            self._payload(winner="O", player1_score=3, player2_score=7),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        match = Match.objects.get()
        player = MatchPlayer.objects.get(match=match)
        self.assertEqual(match.finish_reason, FinishReason.SCORE)
        self.assertIsNone(match.winner_id)
        self.assertEqual(player.outcome, MatchOutcome.LOSS)

    def test_valid_draw_local_match(self):
        response = self.client.post(
            "/api/games/matches/create/",
            self._payload(winner=None, player1_score=0, player2_score=0),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        match = Match.objects.get()
        player = MatchPlayer.objects.get(match=match)
        self.assertEqual(match.finish_reason, FinishReason.DRAW)
        self.assertIsNone(match.winner_id)
        self.assertEqual(player.outcome, MatchOutcome.DRAW)
