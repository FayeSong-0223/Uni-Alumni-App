from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Activity, ActivityBooking

User = get_user_model()


class BookingVisibilityTests(TestCase):
    """Regression tests for the booking-list PII restriction.

    Background: GET /api/activities/<id>/bookings/ used to return every
    confirmed booking (name, email, notes) to any authenticated user. The
    endpoint is now restricted so only staff or the activity organizer see
    the full list; everyone else gets a count + their own booking.
    """

    def setUp(self):
        self.client = APIClient()
        self.organizer = User.objects.create_user(
            username="organizer", email="org@test.com", password="testpass123"
        )
        self.attendee = User.objects.create_user(
            username="attendee", email="att@test.com", password="testpass123"
        )
        self.outsider = User.objects.create_user(
            username="outsider", email="out@test.com", password="testpass123"
        )
        self.staff = User.objects.create_user(
            username="staffuser", email="staff@test.com", password="testpass123"
        )
        self.staff.is_staff = True
        self.staff.save()

        now = timezone.now()
        self.activity = Activity.objects.create(
            title="Test Event",
            description="Some event",
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=1, hours=2),
            organizer=self.organizer,
        )
        ActivityBooking.objects.create(
            activity=self.activity,
            user=self.attendee,
            name="Att Endee",
            email="att@test.com",
            notes="vegetarian",
            status="confirmed",
        )
        # A second confirmed booking by an unrelated user — used to prove
        # the outsider can't see other people's PII even when they have
        # their own booking.
        self.other = User.objects.create_user(
            username="other", email="other@test.com", password="testpass123"
        )
        ActivityBooking.objects.create(
            activity=self.activity,
            user=self.other,
            name="Other Person",
            email="other@test.com",
            notes="allergic to peanuts",
            status="confirmed",
        )

    def _get_bookings(self, user):
        self.client.force_authenticate(user=user)
        return self.client.get(f"/api/activities/{self.activity.id}/bookings/")

    def test_organizer_sees_full_booking_list(self):
        response = self._get_bookings(self.organizer)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)
        # Full PII is returned to the organizer — that's the whole point.
        emails = {b["email"] for b in response.data}
        self.assertIn("att@test.com", emails)
        self.assertIn("other@test.com", emails)

    def test_staff_sees_full_booking_list(self):
        response = self._get_bookings(self.staff)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)

    def test_outsider_gets_count_only_no_pii(self):
        response = self._get_bookings(self.outsider)
        self.assertEqual(response.status_code, 200)
        # Non-staff, non-organizer users get the summary shape, not the list.
        self.assertIsInstance(response.data, dict)
        self.assertEqual(response.data["participant_count"], 2)
        self.assertIsNone(response.data["my_booking"])
        # Make absolutely sure no PII leaked through any field.
        body = str(response.data)
        self.assertNotIn("att@test.com", body)
        self.assertNotIn("other@test.com", body)
        self.assertNotIn("vegetarian", body)
        self.assertNotIn("peanuts", body)

    def test_attendee_sees_only_their_own_booking(self):
        response = self._get_bookings(self.attendee)
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, dict)
        self.assertEqual(response.data["participant_count"], 2)
        self.assertIsNotNone(response.data["my_booking"])
        self.assertEqual(response.data["my_booking"]["email"], "att@test.com")
        # Other users' notes/emails must not appear anywhere.
        body = str(response.data)
        self.assertNotIn("other@test.com", body)
        self.assertNotIn("peanuts", body)
