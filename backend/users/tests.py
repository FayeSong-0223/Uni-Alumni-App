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
