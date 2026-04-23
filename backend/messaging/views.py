from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Message
from .serializers import MessageSerializer, SendMessageSerializer

User = get_user_model()


class SendMessageView(generics.CreateAPIView):
    """Send a message to a connected alumni."""

    serializer_class = SendMessageSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save()
        return Response(
            MessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


class InboxView(generics.ListAPIView):
    """List messages received by the authenticated user."""

    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Message.objects.filter(
            recipient=self.request.user,
        ).select_related("sender__profile", "recipient__profile")


class SentMessagesView(generics.ListAPIView):
    """List messages sent by the authenticated user."""

    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Message.objects.filter(
            sender=self.request.user,
        ).select_related("sender__profile", "recipient__profile")


class MessageDetailView(generics.RetrieveAPIView):
    """View a single message. Marks it as read if the user is the recipient."""

    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(
            Q(sender=user) | Q(recipient=user),
        ).select_related("sender__profile", "recipient__profile")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.recipient == request.user and not instance.is_read:
            instance.is_read = True
            instance.save(update_fields=["is_read"])
        return Response(self.get_serializer(instance).data)


class ConversationView(generics.ListAPIView):
    """List all messages between the authenticated user and another alumni."""

    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        alumni_id = self.kwargs["alumni_id"]
        try:
            other_user = User.objects.get(alumni_id=alumni_id)
        except User.DoesNotExist:
            return Message.objects.none()

        # Mark all unread messages from the other user as read
        Message.objects.filter(
            sender=other_user, recipient=user, is_read=False
        ).update(is_read=True)

        return Message.objects.filter(
            (Q(sender=user) & Q(recipient=other_user))
            | (Q(sender=other_user) & Q(recipient=user))
        ).select_related("sender__profile", "recipient__profile")
