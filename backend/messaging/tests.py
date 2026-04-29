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


class MessagePermissionBoundaryTests(TestCase):
    """Permission boundary for reading messages.

    Only the sender or the recipient of a message may view it. A third
    party — even an authenticated alumni — must not be able to retrieve
    a message via its detail endpoint, see it appear in their inbox, or
    extract it via the conversation endpoint by impersonating one of
    the participants in the URL path.
    """

    def setUp(self):
        self.client = APIClient()
        self.sender = User.objects.create_user(
            username="sender", email="s@test.com", password="testpass123"
        )
        self.recipient = User.objects.create_user(
            username="recipient", email="r@test.com", password="testpass123"
        )
        self.outsider = User.objects.create_user(
            username="outsider", email="o@test.com", password="testpass123"
        )
        # Direct-create the message at model level. The send endpoint
        # would require a connection between sender and recipient — we
        # don't need that for the read-side permission tests.
        self.message = Message.objects.create(
            sender=self.sender,
            recipient=self.recipient,
            subject="Private",
            body="This is a confidential note.",
        )

    def test_anonymous_cannot_view_message_detail(self):
        response = self.client.get(f"/api/messaging/{self.message.id}/")
        self.assertEqual(response.status_code, 401)

    def test_third_party_gets_404_on_message_detail(self):
        # Authenticated, but neither sender nor recipient — the queryset
        # filters them out so DRF returns 404, which deliberately does
        # not leak whether the message exists.
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(f"/api/messaging/{self.message.id}/")
        self.assertEqual(response.status_code, 404)

    def test_recipient_can_view_message(self):
        self.client.force_authenticate(user=self.recipient)
        response = self.client.get(f"/api/messaging/{self.message.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["body"], "This is a confidential note.")

    def test_sender_can_view_their_own_message(self):
        self.client.force_authenticate(user=self.sender)
        response = self.client.get(f"/api/messaging/{self.message.id}/")
        self.assertEqual(response.status_code, 200)

    def test_third_party_inbox_does_not_show_others_messages(self):
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get("/api/messaging/inbox/")
        self.assertEqual(response.status_code, 200)
        # DRF default pagination wraps results in {"results": [...]}; the
        # inbox shape may be a bare list depending on configuration. Cover
        # both so the assertion is robust.
        items = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(items), 0)
        body = str(response.data)
        self.assertNotIn("confidential", body)

    def test_third_party_conversation_endpoint_does_not_leak_messages(self):
        # The outsider asks for the conversation between themselves and
        # `recipient`. The queryset is filtered to messages where the
        # outsider is one party, so the sender↔recipient message must
        # not appear even though `recipient` is named in the URL.
        self.client.force_authenticate(user=self.outsider)
        response = self.client.get(
            f"/api/messaging/conversation/{self.recipient.alumni_id}/"
        )
        self.assertEqual(response.status_code, 200)
        items = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(items), 0)
        body = str(response.data)
        self.assertNotIn("confidential", body)
