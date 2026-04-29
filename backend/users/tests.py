import pyotp
from django.core.cache import cache
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

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


class AuthRateLimitTests(TestCase):
    """Regression tests that the auth endpoints reject excess requests
    with HTTP 429. Without these throttles the endpoints would be open
    to brute-force password guessing, registration spam, and
    password-reset email flooding.

    `THROTTLE_RATES` is patched in-place on `SimpleRateThrottle` because
    DRF resolves it at class-definition time, so `override_settings`
    alone doesn't reach the throttle classes that are already imported.
    """

    TEST_RATES = {
        "anon": "100/hour",
        "user": "1000/hour",
        "login": "3/min",
        "register": "2/hour",
        "password_reset": "2/hour",
    }

    def setUp(self):
        self.client = APIClient()
        self._original_rates = dict(SimpleRateThrottle.THROTTLE_RATES)
        SimpleRateThrottle.THROTTLE_RATES.clear()
        SimpleRateThrottle.THROTTLE_RATES.update(self.TEST_RATES)
        # Throttle state lives in Django's cache; clear it so each test
        # starts with an empty bucket regardless of run order.
        cache.clear()

    def tearDown(self):
        SimpleRateThrottle.THROTTLE_RATES.clear()
        SimpleRateThrottle.THROTTLE_RATES.update(self._original_rates)
        cache.clear()

    def test_login_throttled_after_burst(self):
        # 3/min: the 4th attempt within the window must be rejected
        # even though the credentials are obviously wrong.
        for _ in range(3):
            response = self.client.post(
                "/api/token/",
                {"username": "nobody", "password": "wrong"},
                format="json",
            )
            self.assertEqual(response.status_code, 401)

        response = self.client.post(
            "/api/token/",
            {"username": "nobody", "password": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, 429)

    def test_register_throttled_after_burst(self):
        # 2/hour: the 3rd registration attempt must be rejected.
        for i in range(2):
            response = self.client.post(
                "/api/auth/register/",
                {
                    "username": f"throttleuser{i}",
                    "email": f"throttle{i}@test.com",
                    "password": "strong-pass-7261",
                    "password_confirm": "strong-pass-7261",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 201)

        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "throttleuser3",
                "email": "throttle3@test.com",
                "password": "strong-pass-7261",
                "password_confirm": "strong-pass-7261",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 429)

    def test_password_reset_throttled_after_burst(self):
        # 2/hour: the 3rd reset request must be rejected. Each request
        # would otherwise trigger a real email send, so this is the
        # endpoint where the throttle matters most.
        for _ in range(2):
            response = self.client.post(
                "/api/auth/password-reset/",
                {"email": "nobody@test.com"},
                format="json",
            )
            # 200 even for unknown emails (anti-enumeration).
            self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/api/auth/password-reset/",
            {"email": "nobody@test.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 429)
