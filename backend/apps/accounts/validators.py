"""
It is used to validate from backend the username uniquness and lowercase chars,
 email lower case chars, and password strength.
"""
import re
from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


def validate_username_unique(value):
    """Ensure username is not already taken (case-insensitive)."""
    value = value.strip()
    if User.objects.filter(username__iexact=value).exists():
        raise serializers.ValidationError("A user with this username already exists.")
    return value


def validate_email_unique(value):
    """Ensure email is not already taken (case-insensitive)."""
    value = value.strip()
    if value != value.lower():
        raise serializers.ValidationError(
            "Email address must not contain uppercase letters."
        )
    if User.objects.filter(email__iexact=value).exists():
        raise serializers.ValidationError("A user with this email already exists.")
    return value


def validate_username_format(value):
    """
    Enforce username format rules:
      - 3–30 characters
      - Lowercase letters, numbers, underscores, and hyphens only
      - Must start with a lowercase letter
    """
    value = value.strip()
    if len(value) < 3:
        raise serializers.ValidationError(
            "Username must be at least 3 characters long."
        )
    if len(value) > 30:
        raise serializers.ValidationError(
            "Username must be at most 30 characters long."
        )
    if not re.fullmatch(r"[a-z][a-z0-9_-]*", value):
        raise serializers.ValidationError(
            "Username must start with a lowercase letter and contain only "
            "lowercase letters, numbers, underscores, and hyphens."
        )
    return value


def validate_password_strength(value):
    """
    Enforce password strength beyond Django's built-in validators:
      - At least 10 characters
      - At least one uppercase letter
      - At least one lowercase letter
      - At least one digit
      - At least one special character
    """
    if len(value) < 10:
        raise serializers.ValidationError(
            "Password must be at least 10 characters long."
        )
    if not re.search(r"[A-Z]", value):
        raise serializers.ValidationError(
            "Password must contain at least one uppercase letter."
        )
    if not re.search(r"[a-z]", value):
        raise serializers.ValidationError(
            "Password must contain at least one lowercase letter."
        )
    if not re.search(r"\d", value):
        raise serializers.ValidationError(
            "Password must contain at least one digit."
        )
    if not re.search(r"[^a-zA-Z0-9]", value):
        raise serializers.ValidationError(
            "Password must contain at least one special character."
        )
    return value
