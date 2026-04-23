from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from profiles.models import Profile

User = get_user_model()


class ProfileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="testuser", email="test@test.com", password="testpass123"
        )
        self.client.force_authenticate(user=self.user)

    def test_profile_created_on_user_creation(self):
        self.assertTrue(Profile.objects.filter(user=self.user).exists())

    def test_get_my_profile(self):
        response = self.client.get("/api/profiles/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["alumni_id"], self.user.alumni_id)

    def test_update_my_profile(self):
        response = self.client.patch("/api/profiles/me/", {
            "name": "Test User",
            "degree": "Bachelor of Science",
            "graduation_year": 2023,
            "industry": "Technology",
            "expertise": ["Python", "Django"],
            "interests": ["AI", "Mentorship"],
            "current_role": "Software Engineer",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Test User")
        self.assertEqual(response.data["expertise"], ["Python", "Django"])

    def test_search_profiles(self):
        self.user.profile.name = "Searchable User"
        self.user.profile.industry = "Finance"
        self.user.profile.save()

        response = self.client.get("/api/profiles/search/?industry=Finance")
        self.assertEqual(response.status_code, 200)

    def test_private_profile_hidden_in_detail(self):
        other = User.objects.create_user(
            username="private", email="priv@test.com", password="testpass123"
        )
        other.is_profile_public = False
        other.save()

        response = self.client.get(f"/api/profiles/{other.alumni_id}/")
        self.assertEqual(response.status_code, 403)
