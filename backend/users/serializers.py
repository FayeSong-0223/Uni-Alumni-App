from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()


def _run_password_validators(password, user=None):
    """Run AUTH_PASSWORD_VALIDATORS and re-raise as a DRF ValidationError.

    Django's validators raise django.core.exceptions.ValidationError, which
    DRF doesn't translate automatically — without this wrapper a weak
    password would surface as an HTTP 500.
    """
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm"]

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        # Build a transient User (not saved) so the validators can compare
        # the password against the username/email for similarity checks.
        candidate = User(username=attrs.get("username"), email=attrs.get("email"))
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "alumni_id",
            "username",
            "email",
            "is_profile_public",
            "allow_contact",
            "is_2fa_enabled",
        ]
        read_only_fields = ["id", "alumni_id", "is_2fa_enabled"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate_new_password(self, value):
        user = self.context["request"].user
        _run_password_validators(value, user=user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class TwoFactorLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class TwoFactorVerifySerializer(serializers.Serializer):
    temp_token = serializers.CharField()
    totp_code = serializers.CharField(max_length=6)


class TOTPEnableSerializer(serializers.Serializer):
    totp_code = serializers.CharField(max_length=6)


class TOTPDisableSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    new_password = serializers.CharField(min_length=8)

    def validate_new_password(self, value):
        # User identity isn't known until the view matches the email+code,
        # so similarity checks here run without a user. The view
        # re-validates against the resolved user before saving.
        _run_password_validators(value, user=None)
        return value
