from django.contrib import admin

from .models import Message


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["sender", "recipient", "subject", "is_read", "created_at"]
    list_filter = ["is_read", "created_at"]
    search_fields = [
        "sender__username",
        "sender__alumni_id",
        "recipient__username",
        "recipient__alumni_id",
        "subject",
    ]
    raw_id_fields = ["sender", "recipient"]
