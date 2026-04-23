from django.db.models import Q
from rest_framework import serializers
from django.contrib.auth import get_user_model

from connections.models import ContactRequest
from .models import Message

User = get_user_model()


class UserBriefSerializer(serializers.Serializer):
    alumni_id = serializers.CharField(read_only=True)
    name = serializers.SerializerMethodField()

    def get_name(self, obj):
        profile = getattr(obj, "profile", None)
        if profile and profile.name:
            return profile.name
        return obj.username


class MessageSerializer(serializers.ModelSerializer):
    sender = UserBriefSerializer(read_only=True)
    recipient = UserBriefSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ["id", "sender", "recipient", "subject", "body", "is_read", "created_at"]
        read_only_fields = fields


class SendMessageSerializer(serializers.Serializer):
    recipient_alumni_id = serializers.CharField()
    subject = serializers.CharField(max_length=255, required=False, default="Message")
    body = serializers.CharField()

    def validate_recipient_alumni_id(self, value):
        try:
            User.objects.get(alumni_id=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User with this alumni ID does not exist.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        sender = request.user
        recipient_alumni_id = attrs["recipient_alumni_id"]

        if sender.alumni_id == recipient_alumni_id:
            raise serializers.ValidationError(
                {"recipient_alumni_id": "You cannot send a message to yourself."}
            )

        recipient = User.objects.get(alumni_id=recipient_alumni_id)

        # Check that sender and recipient are connected (accepted contact request)
        is_connected = ContactRequest.objects.filter(
            Q(from_user=sender, to_user=recipient)
            | Q(from_user=recipient, to_user=sender),
            status="accepted",
        ).exists()

        if not is_connected:
            raise serializers.ValidationError(
                {"recipient_alumni_id": "You can only message users you are connected with."}
            )

        attrs["recipient"] = recipient
        return attrs

    def create(self, validated_data):
        sender = self.context["request"].user
        return Message.objects.create(
            sender=sender,
            recipient=validated_data["recipient"],
            subject=validated_data.get("subject", "Message"),
            body=validated_data["body"],
        )
