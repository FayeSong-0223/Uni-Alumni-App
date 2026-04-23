from rest_framework import serializers
from .models import Activity, ActivityBooking


class ActivitySerializer(serializers.ModelSerializer):
    organizer_name = serializers.CharField(source='organizer.profile.name', read_only=True)
    current_participants_count = serializers.ReadOnlyField()
    spots_available = serializers.ReadOnlyField()
    user_booking_status = serializers.SerializerMethodField()
    user_booking_id = serializers.SerializerMethodField()
    # Extra context from search — match reasons shown in UI
    match_reasons = serializers.SerializerMethodField()
    match_score = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = [
            'id', 'title', 'description', 'location',
            'start_time', 'end_time',
            'max_participants', 'organizer', 'organizer_name',
            'image', 'tags', 'category',
            'current_participants_count', 'spots_available',
            'user_booking_status', 'user_booking_id',
            'match_reasons', 'match_score',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['organizer', 'created_at', 'updated_at']

    def get_user_booking_status(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        booking = obj.bookings.filter(user=request.user).first()
        return booking.status if booking else None

    def get_user_booking_id(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        booking = obj.bookings.filter(user=request.user).first()
        return booking.id if booking else None

    def get_match_reasons(self, obj):
        """Annotated by search/recs view via `_match_reasons` attr on the instance."""
        return getattr(obj, "_match_reasons", [])

    def get_match_score(self, obj):
        # Normalized 0-100 relevance. None when not ranked.
        return getattr(obj, "_match_score", None)


class ActivityBookingSerializer(serializers.ModelSerializer):
    activity_title = serializers.CharField(source='activity.title', read_only=True)
    user_id = serializers.CharField(source='user.alumni_id', read_only=True)
    # Include activity start/end so the calendar view can render without a second fetch
    activity_start_time = serializers.DateTimeField(source='activity.start_time', read_only=True)
    activity_end_time = serializers.DateTimeField(source='activity.end_time', read_only=True)
    activity_location = serializers.CharField(source='activity.location', read_only=True)
    activity_image = serializers.ImageField(source='activity.image', read_only=True)

    class Meta:
        model = ActivityBooking
        fields = [
            'id', 'activity', 'activity_title', 'user', 'user_id',
            'activity_start_time', 'activity_end_time',
            'activity_location', 'activity_image',
            'name', 'email', 'notes', 'status', 'created_at'
        ]
        read_only_fields = ['user', 'created_at']

    def validate(self, attrs):
        activity = attrs.get('activity')
        if activity and not activity.spots_available:
            raise serializers.ValidationError("This activity is fully booked.")
        return attrs
