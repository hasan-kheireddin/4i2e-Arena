from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    UserUpdateSerializer,
    get_tokens_for_user,
)

class RegisterView(APIView):
    """
    Create a new user account.

    Accepts username, email, password, password2, and optional display_name.
    Returns the user profile and JWT token pair on success.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        return Response(
            {
                "user": profile,
                "tokens": tokens,
            },
            status=status.HTTP_201_CREATED,
        )

class LoginView(APIView):
    """
    Authenticate with username (or email) + password.
    Returns the user profile and JWT token pair.

    If the user has 2FA enabled, returns `requires_2fa: true` with a
    temporary token instead — the client must call the 2FA verification
    endpoint to complete login. (2FA flow is implemented in Task 2.3.)
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        # Update last activity and online status
        user.is_online = True
        user.last_activity = timezone.now()
        user.save(update_fields=["is_online", "last_activity"])

        # If 2FA is enabled, signal the client to complete verification
        if user.is_2fa_enabled:
            # Generate a short-lived token for the 2FA step
            refresh = RefreshToken.for_user(user)
            refresh.set_exp(lifetime=timezone.timedelta(minutes=5))
            return Response(
                {
                    "requires_2fa": True,
                    "temp_token": str(refresh.access_token),
                    "user_id": str(user.id),
                },
                status=status.HTTP_200_OK,
            )

        tokens = get_tokens_for_user(user)
        profile = UserProfileSerializer(user).data
        return Response(
            {
                "user": profile,
                "tokens": tokens,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    """
    Blacklist the refresh token to invalidate the session.
    The client should also discard the access token locally.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Token is invalid or already blacklisted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Set user offline
        request.user.is_online = False
        request.user.save(update_fields=["is_online"])

        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )

class CustomTokenRefreshView(TokenRefreshView):
    """
    Accepts a refresh token and returns a new access + refresh token pair.
    Inherits from SimpleJWT's TokenRefreshView.
    The old refresh token is blacklisted after rotation (configured in
    settings.SIMPLE_JWT.ROTATE_REFRESH_TOKENS / BLACKLIST_AFTER_ROTATION).
    """

    pass

class ProfileView(generics.RetrieveAPIView):
    """
    Return the authenticated user's full profile.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user

class ProfileUpdateView(generics.UpdateAPIView):
    """
    Update the authenticated user's profile.
    Accepts: display_name, avatar_url, preferred_language.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserUpdateSerializer
    http_method_names = ["patch"]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """
    Change the authenticated user's password.
    Requires old_password, new_password, new_password2.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        return Response(
            {"detail": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )
