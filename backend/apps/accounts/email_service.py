"""
It contain two helpers for sending OTP emails for account verification
and rest password link with token
"""
from __future__ import annotations


from django.conf import settings
from django.core.mail import send_mail


def send_otp_email(user, otp: str) -> None:
    """Send a 6-digit OTP to the user's email for account verification."""
    subject = "Verify your 4i2e Arena account"
    message = (
        f"Hi {user.username},\n\n"
        f"Your verification code is:\n\n"
        f"    {otp}\n\n"
        f"This code expires in 15 minutes.\n\n"
        f"If you did not create an account, please ignore this email.\n\n"
        f"– 4i2e Arena"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        raise


def send_password_reset_email(
    user,
    token: str,
    frontend_url: str | None = None,
) -> None:
    """Send a password reset link to the user's email."""
    base_url = (
        (frontend_url or "").rstrip("/")
        or getattr(settings, "FRONTEND_URL", "https://localhost:8443")
    )
    reset_url = f"{base_url}/reset-password?token={token}"

    subject = "Reset your 4i2e Arena password"
    message = (
        f"Hi {user.username},\n\n"
        f"We received a request to reset your password.\n\n"
        f"Click the link below to set a new password:\n\n"
        f"    {reset_url}\n\n"
        f"This link expires in 30 minutes.\n\n"
        f"If you did not request a password reset, please ignore this email.\n\n"
        f"– 4i2e Arena"
    )
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        raise
