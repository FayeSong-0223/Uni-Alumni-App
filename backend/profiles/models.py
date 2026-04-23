from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    name = models.CharField(max_length=255, blank=True)
    degree = models.CharField(max_length=255, blank=True)
    graduation_year = models.IntegerField(null=True, blank=True)
    industry = models.CharField(max_length=255, blank=True)
    expertise = models.JSONField(default=list, blank=True)
    # Renamed from `interests` — represents personal/leisure hobbies
    hobbies = models.JSONField(default=list, blank=True)
    # New: constrained to values from ProfessionalInterestOption (dropdown)
    professional_interests = models.JSONField(default=list, blank=True)
    # New: user-defined free-text company names (also tracked in Company model)
    companies = models.JSONField(default=list, blank=True)
    current_role = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    profile_picture = models.ImageField(
        upload_to="profile_pictures/",
        blank=True,
        null=True,
    )

    def __str__(self):
        return f"{self.name or self.user.username} - {self.degree}"


class ProfessionalInterestOption(models.Model):
    """
    Dictionary table that backs the professional_interests dropdown.
    Seeded via a data migration; admins can extend.
    """
    slug = models.SlugField(unique=True, max_length=80)
    label = models.CharField(max_length=120)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "label"]

    def __str__(self):
        return self.label


class Company(models.Model):
    """
    Normalized catalog of company names. Grows from user input,
    used for search-bar autocomplete and popularity ranking.
    Companies are NEVER exposed as a filter — they only surface in autocomplete.
    """
    name_normalized = models.CharField(max_length=255, unique=True, db_index=True)
    name_display = models.CharField(max_length=255)
    use_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-use_count", "name_display"]
        verbose_name_plural = "Companies"

    def __str__(self):
        return self.name_display

    @classmethod
    def register(cls, raw_name):
        """Normalize and upsert a user-provided company name."""
        if not raw_name:
            return None
        name_display = raw_name.strip()
        if not name_display:
            return None
        name_normalized = name_display.lower()
        obj, created = cls.objects.get_or_create(
            name_normalized=name_normalized,
            defaults={"name_display": name_display},
        )
        if not created:
            cls.objects.filter(pk=obj.pk).update(use_count=models.F("use_count") + 1)
        return obj
