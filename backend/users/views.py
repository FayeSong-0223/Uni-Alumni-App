import io
import base64
import random
import string

import pyotp
import qrcode
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core import signing
from django.conf import settings
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    ChangePasswordSerializer,
    RegisterSerializer,
    UserSerializer,
    TwoFactorLoginSerializer,
    TwoFactorVerifySerializer,
    TOTPEnableSerializer,
    TOTPDisableSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)

User = get_user_model()

TEMP_TOKEN_MAX_AGE = 300  # 5 minutes


# ── Registration ──────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    """Register a new alumni user account."""

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


# ── Current user profile ─────────────────────────────────────────────

class UserProfileView(generics.RetrieveUpdateAPIView):
    """Retrieve or update the currently authenticated user's profile."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


# ── Change password ───────────────────────────────────────────────────

class ChangePasswordView(generics.GenericAPIView):
    """Change the authenticated user's password."""

    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


# ── 2FA-aware Login ──────────────────────────────────────────────────

def _generate_tokens(user):
    """Generate JWT access+refresh tokens for a user."""
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


class TwoFactorLoginView(APIView):
    """
    Login endpoint that supports 2FA.
    If user has 2FA disabled → returns JWT tokens immediately.
    If user has 2FA enabled  → returns a temp_token; client must
    call /api/token/2fa-verify/ with the TOTP code.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TwoFactorLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "No active account found with the given credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_2fa_enabled:
            return Response(_generate_tokens(user))

        # 2FA is enabled – issue a temporary signed token
        signer = signing.TimestampSigner()
        temp_token = signer.sign(str(user.pk))
        return Response({
            "requires_2fa": True,
            "temp_token": temp_token,
        })


class TwoFactorVerifyView(APIView):
    """Verify a TOTP code and return JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Verify temp token
        signer = signing.TimestampSigner()
        try:
            user_pk = signer.unsign(
                serializer.validated_data["temp_token"],
                max_age=TEMP_TOKEN_MAX_AGE,
            )
        except signing.BadSignature:
            return Response(
                {"detail": "Invalid or expired verification token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(pk=user_pk)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify TOTP code
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(serializer.validated_data["totp_code"], valid_window=1):
            return Response(
                {"detail": "Invalid authenticator code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(_generate_tokens(user))


# ── TOTP Setup / Enable / Disable ────────────────────────────────────

class TOTPSetupView(APIView):
    """Generate a new TOTP secret and QR code for the authenticated user.

    The new secret is written to `pending_totp_secret`; the active
    `totp_secret` is left untouched so a user with 2FA already enabled
    can abandon setup without losing access to their existing
    authenticator app.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        secret = pyotp.random_base32()
        user.pending_totp_secret = secret
        user.save(update_fields=["pending_totp_secret"])

        totp = pyotp.TOTP(secret)
        otpauth_uri = totp.provisioning_uri(
            name=user.email,
            issuer_name="AU Alumni Network",
        )

        # Generate QR code as base64
        img = qrcode.make(otpauth_uri)
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()

        return Response({
            "secret": secret,
            "otpauth_uri": otpauth_uri,
            "qr_code_base64": qr_base64,
        })


class TOTPEnableView(APIView):
    """Verify a TOTP code to enable 2FA.

    Verifies against `pending_totp_secret` and only promotes it to the
    active `totp_secret` after a successful code, so a half-finished setup
    can never lock a user out of their existing 2FA.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TOTPEnableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.pending_totp_secret:
            return Response(
                {"detail": "Run 2FA setup first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        totp = pyotp.TOTP(user.pending_totp_secret)
        if not totp.verify(serializer.validated_data["totp_code"], valid_window=1):
            return Response(
                {"detail": "Invalid code. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.totp_secret = user.pending_totp_secret
        user.pending_totp_secret = ""
        user.is_2fa_enabled = True
        user.save(update_fields=["totp_secret", "pending_totp_secret", "is_2fa_enabled"])
        return Response({"detail": "Two-factor authentication enabled."})


class TOTPDisableView(APIView):
    """Disable 2FA after verifying the user's password."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TOTPDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["password"]):
            return Response(
                {"detail": "Incorrect password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_2fa_enabled = False
        user.totp_secret = ""
        user.pending_totp_secret = ""
        user.save(update_fields=["is_2fa_enabled", "totp_secret", "pending_totp_secret"])
        return Response({"detail": "Two-factor authentication disabled."})


# ── Password Reset ────────────────────────────────────────────────────

class PasswordResetRequestView(APIView):
    """Send a 6-digit password reset code to the user's email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]

        # Always return success to prevent email enumeration
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "If an account with that email exists, a reset code has been sent."}
            )

        code = "".join(random.choices(string.digits, k=6))
        user.password_reset_code = code
        user.password_reset_code_created = timezone.now()
        user.save(update_fields=["password_reset_code", "password_reset_code_created"])

        send_mail(
            subject="AU Alumni Network – Password Reset Code",
            message=f"Your password reset code is: {code}\n\nThis code expires in 15 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return Response(
            {"detail": "If an account with that email exists, a reset code has been sent."}
        )


class PasswordResetConfirmView(APIView):
    """Verify the reset code and set a new password."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]
        new_password = serializer.validated_data["new_password"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid email or code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.password_reset_code or user.password_reset_code != code:
            return Response(
                {"detail": "Invalid reset code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check expiry (15 minutes)
        if user.password_reset_code_created:
            elapsed = (timezone.now() - user.password_reset_code_created).total_seconds()
            if elapsed > 900:
                return Response(
                    {"detail": "Reset code has expired. Please request a new one."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Re-run validators against the resolved user so the
        # UserAttributeSimilarityValidator can catch passwords that look
        # like the username/email. (The serializer-level check ran without
        # a user.)
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response(
                {"new_password": list(exc.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.password_reset_code = ""
        user.password_reset_code_created = None
        user.save(update_fields=["password", "password_reset_code", "password_reset_code_created"])

        return Response({"detail": "Password has been reset successfully."})
