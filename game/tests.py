import re

from django.test import Client, TestCase
from django.urls import reverse

from .models import GameScore


class GamePageTests(TestCase):
    def test_home_and_game_pages_render(self):
        self.assertEqual(self.client.get(reverse("game:home")).status_code, 200)
        self.assertEqual(self.client.get(reverse("game:play")).status_code, 200)

    def test_leaderboard_shows_saved_scores(self):
        GameScore.objects.create(
            player_name="Racer", score=250, distance=1500, coins=1
        )

        response = self.client.get(reverse("game:leaderboard"))

        self.assertContains(response, "Racer")
        self.assertContains(response, "250")


class ScoreSubmissionTests(TestCase):
    def setUp(self):
        self.csrf_client = Client(enforce_csrf_checks=True)
        response = self.csrf_client.get(reverse("game:play"))
        match = re.search(
            rb'name="csrfmiddlewaretoken" value="([^"]+)"',
            response.content,
        )
        self.assertIsNotNone(match)
        self.csrf_token = match.group(1).decode()

    def post_score(self, data):
        return self.csrf_client.post(
            reverse("game:save_score"),
            data,
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def test_score_requires_csrf_token(self):
        response = Client(enforce_csrf_checks=True).post(
            reverse("game:save_score"),
            {"player_name": "Racer", "distance": "100", "coins": "1"},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(GameScore.objects.count(), 0)

    def test_score_is_calculated_and_saved_server_side(self):
        response = self.post_score(
            {"player_name": "  Racer  ", "distance": "1250", "coins": "3"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content, {"ok": True, "score": 425})
        saved_score = GameScore.objects.get()
        self.assertEqual(saved_score.player_name, "Racer")
        self.assertEqual(saved_score.score, 425)

    def test_invalid_score_data_is_rejected(self):
        response = self.post_score(
            {"player_name": "Racer", "distance": "-1", "coins": "1"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(GameScore.objects.count(), 0)
