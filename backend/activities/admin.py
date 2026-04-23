from django.contrib import admin
from .models import Activity, ActivityBooking


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ['title', 'organizer', 'start_time', 'max_participants', 'current_participants_count']
    list_filter = ['start_time', 'organizer']
    search_fields = ['title', 'description', 'location']


@admin.register(ActivityBooking)
class ActivityBookingAdmin(admin.ModelAdmin):
    list_display = ['name', 'activity', 'user', 'email', 'status', 'created_at']
    list_filter = ['status', 'created_at', 'activity']
    search_fields = ['name', 'email', 'activity__title']