from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError


class ContactRequest(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("rejected", "Rejected"),
    ]

    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_contact_requests",
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="received_contact_requests",
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="pending",
    )
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("from_user", "to_user")
        ordering = ["-created_at"]

    def clean(self):
        # Prevent sending request to yourself
        if self.from_user == self.to_user:
            raise ValidationError("Cannot send connection request to yourself.")
        
        # Check for existing requests in either direction
        existing_request = ContactRequest.objects.filter(
            models.Q(from_user=self.from_user, to_user=self.to_user) |
            models.Q(from_user=self.to_user, to_user=self.from_user)
        ).exclude(pk=self.pk).first()
        
        if existing_request:
            raise ValidationError("A connection request already exists between these users.")
        
        # Check if users are already connected
        existing_connection = Connection.objects.filter(
            models.Q(user1=self.from_user, user2=self.to_user) |
            models.Q(user1=self.to_user, user2=self.from_user)
        ).first()
        
        if existing_connection:
            raise ValidationError("These users are already connected.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.from_user} -> {self.to_user} ({self.status})"


class Connection(models.Model):
    """
    Represents a bidirectional connection between two users.
    Always stores the connection with user1_id < user2_id to ensure uniqueness.
    """
    user1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_as_user1",
    )
    user2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="connections_as_user2",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user1", "user2")
        ordering = ["-created_at"]

    def clean(self):
        # Prevent self-connection
        if self.user1 == self.user2:
            raise ValidationError("Cannot connect a user to themselves.")

    def save(self, *args, **kwargs):
        # Always ensure user1_id < user2_id for consistent ordering
        if self.user1.id > self.user2.id:
            self.user1, self.user2 = self.user2, self.user1
        self.full_clean()
        super().save(*args, **kwargs)

    @classmethod
    def create_connection(cls, user1, user2):
        """Create a bidirectional connection between two users."""
        if user1.id > user2.id:
            user1, user2 = user2, user1
        return cls.objects.create(user1=user1, user2=user2)

    @classmethod
    def are_connected(cls, user1, user2):
        """Check if two users are connected."""
        if user1.id > user2.id:
            user1, user2 = user2, user1
        return cls.objects.filter(user1=user1, user2=user2).exists()

    @classmethod
    def get_connections_for_user(cls, user):
        """Get all connections for a user."""
        return cls.objects.filter(
            models.Q(user1=user) | models.Q(user2=user)
        )

    def get_other_user(self, user):
        """Get the other user in this connection."""
        return self.user2 if self.user1 == user else self.user1

    def __str__(self):
        return f"{self.user1} ↔ {self.user2}"
