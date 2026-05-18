from django.conf import settings
from django.db import models
from django.utils import timezone


class ActivityQuerySet(models.QuerySet):
    def alive(self):
        """Non-deleted activities."""
        return self.filter(is_deleted=False)

    def upcoming(self):
        """Activities that haven't ended yet."""
        return self.alive().filter(end_time__gte=timezone.now())


class Activity(models.Model):
    CATEGORY_CHOICES = [
        ("networking", "Networking"),
        ("workshop", "Workshop"),
        ("social", "Social"),
        ("career", "Career"),
        ("sports", "Sports"),
        ("volunteering", "Volunteering"),
        ("mentorship", "Mentorship"),
        ("other", "Other"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField()
    location = models.CharField(max_length=255, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    max_participants = models.PositiveIntegerField(null=True, blank=True)
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organized_activities",
    )
    # Admin-uploaded hero image for the activity card / detail screen
    image = models.ImageField(upload_to="activity_images/", blank=True, null=True)
    # Free-form tags that power keyword matching + filters (e.g. ["career","ai","networking"])
    tags = models.JSONField(default=list, blank=True)
    # Optional top-level category (different from tags — one-of)
    category = models.CharField(
        max_length=32, choices=CATEGORY_CHOICES, default="other", blank=True
    )
    # Soft delete. expire_activities job flips this for past events.
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    # Semantic-search vector for title+description. 384 floats from
    # sentence-transformers all-MiniLM-L6-v2. Populated by a post_save
    # signal; null until backfilled. See activities/semantic.py.
    embedding = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ActivityQuerySet.as_manager()

    class Meta:
        ordering = ["-start_time"]
        verbose_name_plural = "Activities"
        indexes = [
            models.Index(fields=["is_deleted", "end_time"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return self.title

    @property
    def current_participants_count(self):
        return self.bookings.filter(status="confirmed").count()

    @property
    def spots_available(self):
        if self.max_participants is None:
            return True
        return self.current_participants_count < self.max_participants

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])


class ActivityBooking(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("cancelled", "Cancelled"),
    ]

    activity = models.ForeignKey(
        Activity,
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activity_bookings",
    )
    name = models.CharField(max_length=255)
    email = models.EmailField()
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="confirmed",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("activity", "user")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.activity.title}"
