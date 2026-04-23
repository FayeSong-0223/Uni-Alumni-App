from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "alumni_id",
        "username",
        "email",
        "is_profile_public",
        "allow_contact",
        "is_staff",
    ]
    list_filter = ["is_profile_public", "allow_contact", "is_staff", "is_active"]
    search_fields = ["alumni_id", "username", "email"]
    readonly_fields = ["alumni_id"]

    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Alumni Settings",
            {
                "fields": (
                    "alumni_id",
                    "is_profile_public",
                    "allow_contact",
                ),
            },
        ),
    )

    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (
            "Alumni Settings",
            {
                "fields": (
                    "email",
                    "is_profile_public",
                    "allow_contact",
                ),
            },
        ),
    )
