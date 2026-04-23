from django.contrib import admin

from profiles.models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "name", "degree", "graduation_year", "industry", "current_role"]
    list_filter = ["industry", "graduation_year"]
    search_fields = ["name", "degree", "user__username", "user__email", "user__alumni_id"]
    raw_id_fields = ["user"]
