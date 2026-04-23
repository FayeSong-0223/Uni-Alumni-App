from django.contrib import admin

from .models import ContactRequest


@admin.register(ContactRequest)
class ContactRequestAdmin(admin.ModelAdmin):
    list_display = ["from_user", "to_user", "status", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = [
        "from_user__username",
        "from_user__alumni_id",
        "to_user__username",
        "to_user__alumni_id",
    ]
    raw_id_fields = ["from_user", "to_user"]
