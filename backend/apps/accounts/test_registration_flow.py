from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import PendingRegistration


User = get_user_model()


class RegistrationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            "username": "PlayerOne",
            "email": "player@example.com",
            "password": "StrongPass1!",
            "password2": "StrongPass1!",
            "display_name": "Player One",
        }

    @patch("apps.accounts.views.send_otp_email")
    def test_register_creates_pending_registration_not_user(self, mock_send_otp):
        response = self.client.post("/api/accounts/register/", self.payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(PendingRegistration.objects.count(), 1)
        pending = PendingRegistration.objects.get(email="player@example.com")
        self.assertEqual(pending.username, "PlayerOne")
        self.assertEqual(response.json()["email"], "player@example.com")
        mock_send_otp.assert_called_once()

    @patch("apps.accounts.views.send_otp_email")
    def test_verify_email_creates_real_user(self, mock_send_otp):
        self.client.post("/api/accounts/register/", self.payload, format="json")
        pending = PendingRegistration.objects.get(email="player@example.com")

        response = self.client.post(
            "/api/accounts/verify-email/",
            {"email": "player@example.com", "code": pending.code},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(PendingRegistration.objects.count(), 0)
        self.assertEqual(User.objects.count(), 1)
        user = User.objects.get(email="player@example.com")
        self.assertTrue(user.is_active)
        self.assertIn("tokens", response.json())
        self.assertEqual(response.json()["user"]["email"], "player@example.com")

    @patch("apps.accounts.views.send_otp_email")
    def test_reregister_same_pending_account_does_not_fail_as_existing_user(self, mock_send_otp):
        first = self.client.post("/api/accounts/register/", self.payload, format="json")
        self.assertEqual(first.status_code, 201)

        second_payload = {
            **self.payload,
            "password": "DifferentPass1!",
            "password2": "DifferentPass1!",
        }
        second = self.client.post("/api/accounts/register/", second_payload, format="json")

        self.assertEqual(second.status_code, 201)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(PendingRegistration.objects.count(), 1)
        pending = PendingRegistration.objects.get(email="player@example.com")
        self.assertTrue(pending.code)
        self.assertTrue(pending.password_hash)
        self.assertEqual(mock_send_otp.call_count, 2)
