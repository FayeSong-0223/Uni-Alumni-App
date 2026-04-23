from rest_framework import serializers
from django.contrib.auth import get_user_model

from .models import ContactRequest, Connection

User = get_user_model()


class UserBriefSerializer(serializers.Serializer):
    alumni_id = serializers.CharField(read_only=True)
    name = serializers.SerializerMethodField()

    def get_name(self, obj):
        profile = getattr(obj, "profile", None)
        if profile and profile.name:
            return profile.name
        return obj.username


class ContactRequestSerializer(serializers.ModelSerializer):
    from_user = UserBriefSerializer(read_only=True)
    to_user = UserBriefSerializer(read_only=True)

    class Meta:
        model = ContactRequest
        fields = ["id", "from_user", "to_user", "status", "message", "created_at"]
        read_only_fields = fields


class CreateContactRequestSerializer(serializers.Serializer):
    to_user_alumni_id = serializers.CharField()
    message = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_to_user_alumni_id(self, value):
        try:
            recipient = User.objects.get(alumni_id=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User with this alumni ID does not exist.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        sender = request.user
        to_alumni_id = attrs["to_user_alumni_id"]

        # Can't send to self
        if sender.alumni_id == to_alumni_id:
            raise serializers.ValidationError(
                {"to_user_alumni_id": "You cannot send a contact request to yourself."}
            )

        recipient = User.objects.get(alumni_id=to_alumni_id)

        # Recipient must allow contact
        if not recipient.allow_contact:
            raise serializers.ValidationError(
                {"to_user_alumni_id": "This user does not allow contact requests."}
            )

        # No duplicate pending request
        if ContactRequest.objects.filter(
            from_user=sender, to_user=recipient, status="pending"
        ).exists():
            raise serializers.ValidationError(
                {"to_user_alumni_id": "You already have a pending request to this user."}
            )

        attrs["recipient"] = recipient
        return attrs

    def create(self, validated_data):
        sender = self.context["request"].user
        recipient = validated_data["recipient"]
        return ContactRequest.objects.create(
            from_user=sender,
            to_user=recipient,
            message=validated_data.get("message", ""),
        )


class ConnectionSerializer(serializers.ModelSerializer):
    from_user = serializers.SerializerMethodField()
    to_user = serializers.SerializerMethodField()

    class Meta:
        model = Connection
        fields = ["id", "from_user", "to_user", "created_at"]
        read_only_fields = fields

    def get_from_user(self, obj):
        # For compatibility with frontend - return user1
        return UserBriefSerializer(obj.user1).data

    def get_to_user(self, obj):
        # For compatibility with frontend - return user2  
        return UserBriefSerializer(obj.user2).data


class RespondToRequestSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["accepted", "rejected"])
