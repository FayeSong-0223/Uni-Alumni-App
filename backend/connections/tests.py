from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from connections.models import ContactRequest

User = get_user_model()


class ConnectionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="user1", email="u1@test.com", password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@test.com", password="testpass123"
        )
        self.client.force_authenticate(user=self.user1)

    def test_send_contact_request(self):
        response = self.client.post("/api/connections/send/", {
            "to_user_alumni_id": self.user2.alumni_id,
            "message": "Let's connect!",
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "pending")

    def test_cannot_send_to_self(self):
        response = self.client.post("/api/connections/send/", {
            "to_user_alumni_id": self.user1.alumni_id,
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_cannot_send_to_user_who_disallows_contact(self):
        self.user2.allow_contact = False
        self.user2.save()
        response = self.client.post("/api/connections/send/", {
            "to_user_alumni_id": self.user2.alumni_id,
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_accept_request(self):
        req = ContactRequest.objects.create(
            from_user=self.user2, to_user=self.user1, message="Hi"
        )
        response = self.client.post(f"/api/connections/{req.id}/respond/", {
            "status": "accepted",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "accepted")

    def test_list_connections(self):
        ContactRequest.objects.create(
            from_user=self.user1, to_user=self.user2, status="accepted"
        )
        response = self.client.get("/api/connections/list/")
        self.assertEqual(response.status_code, 200)

    def test_received_requests(self):
        ContactRequest.objects.create(from_user=self.user2, to_user=self.user1)
        response = self.client.get("/api/connections/received/")
        self.assertEqual(response.status_code, 200)
