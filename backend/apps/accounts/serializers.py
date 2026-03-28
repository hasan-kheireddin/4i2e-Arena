from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from .validators import (
    validate_email_unique,
    validate_password_strength,
    validate_username_format,
    validate_username_unique,
)

User = get_user_model()

class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializes the public profile of a user.
    Used in auth responses and profile endpoints.
    """

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "display_name",
            "avatar_url",
            "preferred_language",
            "xp",
            "level",
            "is_2fa_enabled",
            "is_online",
            "last_activity",
            "date_joined",
        ]
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    """
    Validates and creates a new user account.

    Fields:
      - username     : 8-30 chars, alphanumeric + _ -, starts with letter
      - email        : valid, unique email
      - password     : 10+ chars, upper + lower + digit + special char
      - password2    : must match password
      - display_name : optional (defaults to username)
    """

    username = serializers.CharField(
        max_length=30,
        validators=[validate_username_format, validate_username_unique],
    )
    email = serializers.EmailField(
        validators=[validate_email_unique],
    )
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password_strength],
    )
    password2 = serializers.CharField(write_only=True)
    display_name = serializers.CharField(max_length=50, required=False, default="")

    def validate_password(self, value):
        """Run Django's built-in password validators as well."""
        validate_password(value)
        return value

    def validate(self, attrs):
        """Ensure the two password fields match."""
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError(
                {"password2": "Passwords do not match."}
            )
        return attrs

    def create(self, validated_data):
        """Create the user and return it with JWT tokens."""
        validated_data.pop("password2")
        password = validated_data.pop("password")
        validated_data["username"] = validated_data["username"].strip()
        validated_data["email"] = validated_data["email"].strip().lower()
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class LoginSerializer(serializers.Serializer):
    """
    Authenticates a user via username/email + password.
    Returns the user instance on success.

    Accepts either `username` or `email` — if the input contains '@',
    it is treated as an email and the corresponding username is looked up.
    """

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username_or_email = attrs["username"]
        password = attrs["password"]

        # Allow login by email
        if "@" in username_or_email:
            try:
                user_obj = User.objects.get(email__iexact=username_or_email)
                username_or_email = user_obj.username
            except User.DoesNotExist:
                raise serializers.ValidationError(
                    {"detail": "Invalid credentials."}
                )

        user = authenticate(username=username_or_email, password=password)

        if user is None:
            raise serializers.ValidationError(
                {"detail": "Invalid credentials."}
            )

        if not user.is_active:
            raise serializers.ValidationError(
                {"detail": "This account has been deactivated."}
            )

        attrs["user"] = user
        return attrs

class UserUpdateSerializer(serializers.ModelSerializer):
    """
    Allows authenticated users to update their profile.
    Password changes are handled separately.
    """

    class Meta:
        model = User
        fields = [
            "display_name",
            "avatar_url",
            "preferred_language",
        ]

    def validate_display_name(self, value):
        if value and len(value) < 2:
            raise serializers.ValidationError(
                "Display name must be at least 2 characters."
            )
        return value

class ChangePasswordSerializer(serializers.Serializer):
    """
    Validates a password change request.
    Requires the old password for security.
    """

    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(
        write_only=True,
        validators=[validate_password_strength],
    )
    new_password2 = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password2"]:
            raise serializers.ValidationError(
                {"new_password2": "New passwords do not match."}
            )
        return attrs

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value


def get_tokens_for_user(user):
    """
    Generate JWT access + refresh tokens for a user.
    Returns a dict: { access, refresh }
    """
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }
