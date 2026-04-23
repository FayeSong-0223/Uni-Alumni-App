from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from connections.models import ContactRequest
from messaging.models import Message

User = get_user_model()


class MessagingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="user1", email="u1@test.com", password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@test.com", password="testpass123"
        )
        # Create accepted connection
        ContactRequest.objects.create(
            from_user=self.user1, to_user=self.user2, status="accepted"
        )
        self.client.force_authenticate(user=self.user1)

    def test_send_message(self):
        response = self.client.post("/api/messaging/send/", {
            "recipient_alumni_id": self.user2.alumni_id,
            "subject": "Hello",
            "body": "Nice to meet you!",
        }, format="json")
        self.assertEqual(response.status_code, 201)

    def test_cannot_message_unconnected_user(self):
        user3 = User.objects.create_user(
            username="user3", email="u3@test.com", password="testpass123"
        )
        response = self.client.post("/api/messaging/send/", {
            "recipient_alumni_id": user3.alumni_id,
            "subject": "Hey",
            "body": "Test",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_inbox(self):
        Message.objects.create(
            sender=self.user2, recipient=self.user1, subject="Hi", body="Hello!"
        )
        response = self.client.get("/api/messaging/inbox/")
        self.assertEqual(response.status_code, 200)

    def test_message_detail_marks_read(self):
        msg = Message.objects.create(
            sender=self.user2, recipient=self.user1, subject="Hi", body="Hello!"
        )
        self.assertFalse(msg.is_read)
        response = self.client.get(f"/api/messaging/{msg.id}/")
        self.assertEqual(response.status_code, 200)
        msg.refresh_from_db()
        self.assertTrue(msg.is_read)

    def test_conversation(self):
        Message.objects.create(
            sender=self.user1, recipient=self.user2, subject="S1", body="B1"
        )
        Message.objects.create(
            sender=self.user2, recipient=self.user1, subject="S2", body="B2"
        )
        response = self.client.get(f"/api/messaging/conversation/{self.user2.alumni_id}/")
        self.assertEqual(response.status_code, 200)
