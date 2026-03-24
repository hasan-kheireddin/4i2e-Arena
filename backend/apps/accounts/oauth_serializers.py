from rest_framework import serializers
from .oauth_providers import OAUTH_PROVIDERS


class OAuthInitiateSerializer(serializers.Serializer):
    """
    Validates the provider name sent by the frontend when the user
    clicks "Sign in with 42".
    """

    provider = serializers.ChoiceField(
        choices=list(OAUTH_PROVIDERS.keys()),
        help_text="OAuth provider name: '42'.",
    )


class OAuthCallbackSerializer(serializers.Serializer):
    """
    Validates the authorization code and state parameter returned by
    the OAuth provider after the user grants consent.
    """

    code = serializers.CharField(
        max_length=2048,
        help_text="Authorization code from the OAuth provider.",
    )
    state = serializers.CharField(
        max_length=128,
        help_text="CSRF state token that was generated during initiation.",
    )
