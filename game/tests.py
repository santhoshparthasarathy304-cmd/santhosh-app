import re
import json
import os
from unittest.mock import MagicMock, patch

from django.test import Client, TestCase
from django.urls import reverse

from .models import (
    AssistantFeedback,
    AssistantMessage,
    FAQ,
    GameProfile,
    GameScore,
    GameTransaction,
    SupportTicket,
    VehicleOwnership,
    VehicleUpgrade,
)
from .services import ensure_game_profile
from .views import server_error


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


class UpgradeFeatureTests(TestCase):
    def setUp(self):
        self.user = self.client_handler_user()
        self.client.force_login(self.user)
        self.profile = ensure_game_profile(self.user)

    def client_handler_user(self):
        from django.contrib.auth import get_user_model

        return get_user_model().objects.create_user(
            username="driver",
            password="secure-test-password",
        )

    def post_json(self, url, data):
        return self.client.post(
            reverse(url),
            data=json.dumps(data),
            content_type="application/json",
        )

    def test_account_garage_and_profile_are_created(self):
        response = self.client.get(reverse("game:garage"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Street Compact")
        self.assertEqual(self.profile.balance, 1000)
        self.assertTrue(
            VehicleOwnership.objects.filter(
                user=self.user,
                vehicle__slug="street-compact",
            ).exists()
        )

    def test_vehicle_purchase_is_atomic_and_idempotent(self):
        payload = {"vehicle": "rally-coupe", "request_id": "buy-rally-001"}
        first = self.post_json("game:buy_vehicle", payload)
        duplicate = self.post_json("game:buy_vehicle", payload)

        self.assertEqual(first.status_code, 409)
        self.assertFalse(first.json()["ok"])
        self.assertEqual(self.profile.balance, 1000)

        claim = self.client.post(reverse("game:daily_reward"))
        self.assertEqual(claim.status_code, 200)
        self.profile.refresh_from_db()
        self.profile.balance = 2000
        self.profile.save(update_fields=["balance"])

        first = self.post_json("game:buy_vehicle", payload)
        balance_after_purchase = self.profile.__class__.objects.get(pk=self.profile.pk).balance
        duplicate = self.post_json("game:buy_vehicle", payload)

        self.assertTrue(first.json()["ok"])
        self.assertTrue(duplicate.json()["duplicate"])
        self.assertEqual(balance_after_purchase, 800)
        self.assertEqual(GameTransaction.objects.filter(user=self.user).count(), 2)
        self.assertEqual(
            VehicleOwnership.objects.filter(
                user=self.user,
                vehicle__slug="rally-coupe",
            ).count(),
            1,
        )
        self.assertEqual(duplicate.json()["balance"], 800)
        selected = self.post_json(
            "game:select_vehicle",
            {"vehicle": "rally-coupe"},
        )
        self.assertTrue(selected.json()["ok"])
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.selected_vehicle.slug, "rally-coupe")

    def test_upgrade_changes_saved_specs_and_duplicate_does_not_charge_twice(self):
        payload = {
            "vehicle": "street-compact",
            "upgrade": "engine",
            "request_id": "engine-upgrade-001",
        }
        response = self.post_json("game:buy_upgrade", payload)
        duplicate = self.post_json("game:buy_upgrade", payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["specs"]["acceleration"], 6.72)
        self.assertTrue(duplicate.json()["duplicate"])
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.balance, 800)
        upgrade = VehicleUpgrade.objects.get(
            ownership__user=self.user,
            upgrade_type="engine",
        )
        self.assertEqual(upgrade.level, 1)

    def test_unowned_car_cannot_be_upgraded_or_selected(self):
        upgrade = self.post_json(
            "game:buy_upgrade",
            {
                "vehicle": "rally-coupe",
                "upgrade": "tires",
                "request_id": "not-owned",
            },
        )
        select = self.post_json(
            "game:select_vehicle",
            {"vehicle": "rally-coupe"},
        )
        self.assertEqual(upgrade.status_code, 404)
        self.assertEqual(select.status_code, 404)
        self.assertEqual(self.profile.balance, 1000)

    def test_daily_reward_can_only_be_claimed_once_per_day(self):
        first = self.client.post(reverse("game:daily_reward"))
        second = self.client.post(reverse("game:daily_reward"))
        self.profile.refresh_from_db()
        self.assertTrue(first.json()["claimed"])
        self.assertFalse(second.json()["claimed"])
        self.assertEqual(self.profile.balance, 1050)
        self.assertEqual(
            GameTransaction.objects.filter(
                user=self.user,
                transaction_type="daily",
            ).count(),
            1,
        )

    def test_faqs_are_seeded_and_rendered_from_sql(self):
        self.assertGreaterEqual(FAQ.objects.filter(is_published=True).count(), 10)
        response = self.client.get(reverse("game:faq"))
        self.assertContains(response, "How do I steer the car?")
        errors = self.client.get(reverse("game:error_guide"))
        for code in ("400", "401", "403", "404", "429", "500", "503", "NR-100"):
            self.assertContains(errors, code)

    @patch.dict(os.environ, {"GEMINI_API_KEY": "", "MONGODB_URI": ""})
    def test_assistant_answers_faq_and_creates_ticket_for_unknown_question(self):
        known = self.post_json(
            "game:assistant_chat",
            {"question": "How do I pause the game?"},
        )
        self.assertEqual(known.status_code, 200)
        self.assertIn("Press P", known.json()["answer"])
        self.assertEqual(known.json()["ticket_id"], None)

        unknown = self.post_json(
            "game:assistant_chat",
            {"question": "Can I transfer credits to another driver?"},
        )
        self.assertEqual(unknown.status_code, 200)
        self.assertIsNotNone(unknown.json()["ticket_id"])
        self.assertEqual(AssistantMessage.objects.count(), 2)
        self.assertEqual(SupportTicket.objects.count(), 1)

    @patch.dict(os.environ, {"GEMINI_API_KEY": "", "MONGODB_URI": ""})
    def test_assistant_error_explanation_and_feedback_are_saved(self):
        answer = self.post_json(
            "game:assistant_chat",
            {"question": "Please explain HTTP 429."},
        )
        self.assertIn("Too many requests", answer.json()["answer"])
        feedback = self.post_json(
            "game:assistant_feedback",
            {
                "message_id": answer.json()["message_id"],
                "was_helpful": True,
            },
        )
        self.assertEqual(feedback.status_code, 200)
        self.assertEqual(AssistantFeedback.objects.count(), 1)

    def test_health_and_custom_not_found_page(self):
        health = self.client.get(reverse("game:health_check"))
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json(), {"status": "ok"})
        with self.settings(DEBUG=False):
            missing = self.client.get("/definitely-not-a-game-route/")
        self.assertEqual(missing.status_code, 404)
        self.assertContains(missing, "Ask the Assistant", status_code=404)

    @patch("game.views.urllib.request.urlopen", side_effect=OSError("offline"))
    def test_external_weather_failure_has_clear_fallback(self, mocked_urlopen):
        response = self.client.get(
            reverse("game:road_weather"),
            {"lat": 13.08, "lon": 80.27},
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["available"])
        self.assertIn("unavailable", response.json()["message"])
        mocked_urlopen.assert_called_once()

    @patch.dict(os.environ, {"GEMINI_API_KEY": "test-key", "MONGODB_URI": ""})
    @patch("game.services.urllib.request.urlopen")
    def test_assistant_uses_gemini_when_configured(self, mocked_urlopen):
        response_body = MagicMock()
        response_body.__enter__.return_value = response_body
        response_body.read.return_value = json.dumps(
            {
                "candidates": [
                    {"content": {"parts": [{"text": "Mocked grounded answer."}]}}
                ]
            }
        ).encode()
        mocked_urlopen.return_value = response_body

        response = self.post_json(
            "game:assistant_chat",
            {"question": "Can the assistant explain how the cars work?"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], "Mocked grounded answer.")
        mocked_urlopen.assert_called_once()
        self.assertEqual(mocked_urlopen.call_args.kwargs["timeout"], 5)

    @patch.dict(os.environ, {"MONGODB_URI": "mongodb://example.test"})
    @patch("game.services.MongoClient")
    def test_chat_logs_are_mirrored_to_mongodb_when_configured(self, mocked_client):
        collection = MagicMock()
        mocked_client.return_value.__getitem__.return_value.__getitem__.return_value = (
            collection
        )
        with patch("game.services._mongo_client", None):
            self.post_json(
                "game:assistant_chat",
                {"question": "How do I pause the game?"},
            )
        collection.insert_one.assert_called_once()

    def test_play_page_contains_owned_vehicle_configuration(self):
        response = self.client.get(reverse("game:play"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "game-config")
        self.assertContains(response, "Street Compact")


class AnonymousSupportTests(TestCase):
    @patch.dict(os.environ, {"GEMINI_API_KEY": "", "MONGODB_URI": ""})
    def test_chat_widget_exists_on_public_pages_and_support_ticket_is_saved(self):
        for route in ("game:home", "game:play", "game:leaderboard", "game:faq"):
            self.assertContains(self.client.get(reverse(route)), "Ask the Assistant")

        response = self.client.post(
            reverse("game:assistant_chat"),
            data=json.dumps({"question": "Can you help me with an unsupported feature?"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(SupportTicket.objects.count(), 1)
        self.assertIsNone(SupportTicket.objects.get().user_id)

    def test_signup_creates_a_profile_and_starter_vehicle(self):
        response = self.client.post(
            reverse("game:signup"),
            {
                "username": "newdriver",
                "password1": "Strong-Test-Password-938!",
                "password2": "Strong-Test-Password-938!",
            },
        )

        self.assertRedirects(response, reverse("game:garage"))
        user = self.client.session["_auth_user_id"]
        self.assertTrue(user)
        game_profile = GameProfile.objects.get(user_id=user)
        self.assertEqual(game_profile.balance, 1000)
        self.assertTrue(
            VehicleOwnership.objects.filter(
                user_id=user,
                vehicle__slug="street-compact",
            ).exists()
        )


class CustomErrorPageTests(TestCase):
    def test_custom_400_and_500_pages_render_with_assistant_link(self):
        with self.settings(DEBUG=False, ALLOWED_HOSTS=["testserver"]):
            bad_request = self.client.get("/", HTTP_HOST="invalid.example")

        self.assertContains(bad_request, "Ask the Assistant", status_code=400)
        successful_request = self.client.get("/")
        server_error_response = server_error(successful_request.wsgi_request)
        self.assertContains(
            server_error_response,
            "Ask the Assistant",
            status_code=500,
        )
