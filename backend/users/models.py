from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model for Adelaide University alumni networking platform."""

    alumni_id = models.CharField(
        max_length=10,
        unique=True,
        blank=True,
        editable=False,
        help_text="Auto-generated alumni identifier (e.g. AL-001).",
    )
    email = models.EmailField(unique=True)
    is_profile_public = models.BooleanField(default=True)
    allow_contact = models.BooleanField(default=True)

    # 2FA / TOTP
    totp_secret = models.CharField(max_length=32, blank=True, default='')
    is_2fa_enabled = models.BooleanField(default=False)

    # Password reset
    password_reset_code = models.CharField(max_length=6, blank=True, default='')
    password_reset_code_created = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def save(self, *args, **kwargs):
        if not self.alumni_id:
            last_user = (
                User.objects.filter(alumni_id__startswith="AL-")
                .order_by("-id")
                .first()
            )
            if last_user and last_user.alumni_id:
                last_number = int(last_user.alumni_id.split("-")[1])
                next_number = last_number + 1
            else:
                next_number = 1
            self.alumni_id = f"AL-{next_number:03d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.alumni_id} - {self.username}"
