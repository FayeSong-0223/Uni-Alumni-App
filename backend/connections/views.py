from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from django.core.exceptions import ValidationError

from .models import ContactRequest, Connection
from .serializers import (
    ContactRequestSerializer,
    CreateContactRequestSerializer,
    RespondToRequestSerializer,
    ConnectionSerializer,
)


class SendContactRequestView(generics.CreateAPIView):
    """Send a contact request to another alumni."""

    serializer_class = CreateContactRequestSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            contact_request = serializer.save()
            return Response(
                ContactRequestSerializer(contact_request).data,
                status=status.HTTP_201_CREATED,
            )
        except ValidationError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ReceivedRequestsView(generics.ListAPIView):
    """List contact requests received by the authenticated user."""

    serializer_class = ContactRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ContactRequest.objects.filter(
            to_user=self.request.user,
            status="pending",
        ).select_related("from_user__profile", "to_user__profile")


class SentRequestsView(generics.ListAPIView):
    """List contact requests sent by the authenticated user."""

    serializer_class = ContactRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ContactRequest.objects.filter(
            from_user=self.request.user,
        ).select_related("from_user__profile", "to_user__profile")


class RespondToRequestView(generics.GenericAPIView):
    """Accept or reject a received contact request."""

    serializer_class = RespondToRequestSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            contact_request = ContactRequest.objects.get(
                pk=pk, to_user=request.user, status="pending"
            )
        except ContactRequest.DoesNotExist:
            return Response(
                {"detail": "Contact request not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        contact_request.status = new_status
        contact_request.save()

        # If accepted, create a Connection
        if new_status == "accepted":
            try:
                Connection.create_connection(contact_request.from_user, contact_request.to_user)
            except ValidationError:
                # Connection already exists, ignore
                pass

        return Response(ContactRequestSerializer(contact_request).data)


class ConnectionsListView(generics.ListAPIView):
    """List all connections for the authenticated user."""

    serializer_class = ConnectionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Connection.get_connections_for_user(self.request.user)
