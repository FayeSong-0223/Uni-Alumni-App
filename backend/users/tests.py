import pyotp
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


class UserModelTests(TestCase):
    def test_alumni_id_auto_generated(self):
        user = User.objects.create_user(username="test1", email="t1@test.com", password="testpass123")
        self.assertTrue(user.alumni_id.startswith("AL-"))
        self.assertEqual(user.alumni_id, "AL-001")

    def test_alumni_id_increments(self):
        User.objects.create_user(username="test1", email="t1@test.com", password="testpass123")
        user2 = User.objects.create_user(username="test2", email="t2@test.com", password="testpass123")
        self.assertEqual(user2.alumni_id, "AL-002")

    def test_default_privacy_settings(self):
        user = User.objects.create_user(username="test1", email="t1@test.com", password="testpass123")
        self.assertTrue(user.is_profile_public)
        self.assertTrue(user.allow_contact)


class AuthAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register(self):
        response = self.client.post("/api/auth/register/", {
            "username": "newuser",
            "email": "new@test.com",
            "password": "securepass123",
            "password_confirm": "securepass123",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIn("alumni_id", response.data)

    def test_register_password_mismatch(self):
        response = self.client.post("/api/auth/register/", {
            "username": "newuser",
            "email": "new@test.com",
            "password": "securepass123",
            "password_confirm": "different123",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_login_jwt(self):
        User.objects.create_user(username="loginuser", email="login@test.com", password="testpass123")
        response = self.client.post("/api/token/", {
            "username": "loginuser",
            "password": "testpass123",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_me_requires_auth(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)

    def test_me_authenticated(self):
        user = User.objects.create_user(username="meuser", email="me@test.com", password="testpass123")
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "meuser")


class TOTPSetupSafetyTests(TestCase):
    """Regression tests for the 'starting setup invalidates the active
    secret' bug. /2fa/setup/ must only mutate `pending_totp_secret`; the
    active `totp_secret` may only change after a successful /2fa/enable/.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="totpuser", email="totp@test.com", password="testpass123"
        )
        # Simulate a user who already has 2FA active.
        self.original_secret = pyotp.random_base32()
        self.user.totp_secret = self.original_secret
        self.user.is_2fa_enabled = True
        self.user.save()
        self.client.force_authenticate(user=self.user)

    def test_setup_does_not_overwrite_active_secret(self):
        response = self.client.get("/api/auth/2fa/setup/")
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        # The active secret is preserved; the candidate sits in pending.
        self.assertEqual(self.user.totp_secret, self.original_secret)
        self.assertNotEqual(self.user.pending_totp_secret, "")
        self.assertNotEqual(self.user.pending_totp_secret, self.original_secret)
        # User remains 2FA-enabled — abandoning setup must not lock them out.
        self.assertTrue(self.user.is_2fa_enabled)

    def test_enable_promotes_pending_secret_only_after_valid_code(self):
        self.client.get("/api/auth/2fa/setup/")
        self.user.refresh_from_db()
        pending = self.user.pending_totp_secret

        # Wrong code → active secret unchanged.
        response = self.client.post(
            "/api/auth/2fa/enable/", {"totp_code": "000000"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.totp_secret, self.original_secret)

        # Correct code → pending is promoted to active and cleared.
        valid_code = pyotp.TOTP(pending).now()
        response = self.client.post(
            "/api/auth/2fa/enable/", {"totp_code": valid_code}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.totp_secret, pending)
        self.assertEqual(self.user.pending_totp_secret, "")
        self.assertTrue(self.user.is_2fa_enabled)


class PasswordValidatorTests(TestCase):
    """Regression tests for AUTH_PASSWORD_VALIDATORS enforcement on the
    register / change-password / reset-password endpoints.
    """

    def setUp(self):
        self.client = APIClient()

    def test_register_rejects_common_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newuser",
                "email": "new@test.com",
                "password": "password",
                "password_confirm": "password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_numeric_only_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newuser",
                "email": "new@test.com",
                "password": "12345678",
                "password_confirm": "12345678",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_register_rejects_password_similar_to_username(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "alicejohnson",
                "email": "alice@test.com",
                "password": "alicejohnson1",
                "password_confirm": "alicejohnson1",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_change_password_rejects_weak_password(self):
        user = User.objects.create_user(
            username="cpuser", email="cp@test.com", password="oldpass-strong-9472"
        )
        self.client.force_authenticate(user=user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"old_password": "oldpass-strong-9472", "new_password": "password"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_password_reset_rejects_weak_password(self):
        from django.utils import timezone

        user = User.objects.create_user(
            username="resetuser", email="reset@test.com", password="oldpass-strong-9472"
        )
        user.password_reset_code = "123456"
        user.password_reset_code_created = timezone.now()
        user.save()
        response = self.client.post(
            "/api/auth/password-reset/confirm/",
            {
                "email": "reset@test.com",
                "code": "123456",
                "new_password": "password",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
