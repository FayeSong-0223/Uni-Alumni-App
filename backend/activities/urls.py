from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivityBookingViewSet,
    ActivityViewSet,
    upload_activity_image,
)

router = DefaultRouter()
router.register(r"activities", ActivityViewSet, basename="activity")
router.register(r"bookings", ActivityBookingViewSet, basename="activitybooking")

urlpatterns = router.urls + [
    # Admin-only image upload for an activity
    path(
        "activities/<int:pk>/image/",
        upload_activity_image,
        name="activity-image-upload",
    ),
]
