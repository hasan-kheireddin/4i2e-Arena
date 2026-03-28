from rest_framework import serializers


class TwoFactorSetupSerializer(serializers.Serializer):
    """Empty — the setup endpoint only needs the authenticated user."""
    pass


class TwoFactorConfirmSerializer(serializers.Serializer):
    """
    Validates the 6-digit TOTP code the user enters to confirm
    that their authenticator app is correctly configured.
    """

    code = serializers.CharField(
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP code from authenticator app.",
    )

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Code must contain only digits.")
        return value


class TwoFactorVerifySerializer(serializers.Serializer):
    """
    Used during login when 2FA is required.
    Accepts the temporary token issued by the login endpoint plus
    the 6-digit TOTP code.
    """

    temp_token = serializers.CharField(
        help_text="Temporary token from the login response.",
    )
    code = serializers.CharField(
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP code from authenticator app.",
    )

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Code must contain only digits.")
        return value


class TwoFactorDisableSerializer(serializers.Serializer):
    """
    Requires a valid TOTP code to disable 2FA — prevents accidental
    or malicious disabling.
    """

    code = serializers.CharField(
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP code to confirm disabling.",
    )

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Code must contain only digits.")
        return value


class RecoveryCodeSerializer(serializers.Serializer):
    """
    Used when the user has lost access to their authenticator app
    and needs to log in with a one-time recovery code.
    """

    temp_token = serializers.CharField(
        help_text="Temporary token from the login response.",
    )
    code = serializers.CharField(
        min_length=6,
        max_length=16,
        help_text="One-time recovery code.",
    )
