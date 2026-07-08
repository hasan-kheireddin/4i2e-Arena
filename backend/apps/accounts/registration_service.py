from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from .models import PendingRegistration

User = get_user_model()


def _effective_display_name(username: str, display_name: str) -> str:
    return display_name.strip() or username.strip()


def _display_name_taken_response():
    return Response(
        {"display_name": ["This display name is already taken."]},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _pending_registration_exists_response():
    return Response(
        {
            "detail": (
                "A pending registration already exists for this "
                "email or username. Please finish verification or "
                "use different credentials."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _pending_display_name_conflicts(display_name: str, pending_pk=None) -> bool:
    queryset = PendingRegistration.objects.select_for_update().filter(
        Q(display_name__iexact=display_name)
        | (Q(display_name="") & Q(username__iexact=display_name))
    )
    if pending_pk is not None:
        queryset = queryset.exclude(pk=pending_pk)
    return queryset.exists()


def _registration_integrity_error_response(
    *,
    username: str,
    email: str,
    effective_display_name: str,
    pending_pk=None,
) -> Response:
    if User.objects.filter(display_name__iexact=effective_display_name).exists():
        return _display_name_taken_response()
    if _pending_display_name_conflicts(effective_display_name, pending_pk):
        return _display_name_taken_response()
    if (
        User.objects.filter(username__iexact=username).exists()
        or User.objects.filter(email__iexact=email).exists()
        or PendingRegistration.objects.filter(username__iexact=username).exists()
        or PendingRegistration.objects.filter(email__iexact=email).exists()
    ):
        return _pending_registration_exists_response()
    return _pending_registration_exists_response()


def _find_pending_registration(
    *,
    email: str,
    username: str,
) -> PendingRegistration | None:
    pending_by_email = (
        PendingRegistration.objects.select_for_update()
        .filter(email__iexact=email)
        .first()
    )
    pending_by_username = (
        PendingRegistration.objects.select_for_update()
        .filter(username__iexact=username)
        .first()
    )

    if (
        pending_by_email
        and pending_by_username
        and pending_by_email.pk != pending_by_username.pk
    ):
        return None

    return pending_by_email or pending_by_username or PendingRegistration()


def prepare_pending_registration(
    *,
    username: str,
    email: str,
    display_name: str,
    password: str,
) -> PendingRegistration | Response:
    effective_display_name = _effective_display_name(username, display_name)
    pending_pk = None
    try:
        with transaction.atomic():
            pending = _find_pending_registration(email=email, username=username)
            if pending is None:
                return _pending_registration_exists_response()
            pending_pk = pending.pk

            if User.objects.filter(
                display_name__iexact=effective_display_name,
            ).exists():
                return _display_name_taken_response()

            if _pending_display_name_conflicts(effective_display_name, pending.pk):
                return _display_name_taken_response()

            pending.username = username
            pending.email = email
            pending.display_name = display_name
            pending.set_password(password)
            pending.issue_code()
            pending.save()
            return pending
    except IntegrityError:
        return _registration_integrity_error_response(
            username=username,
            email=email,
            effective_display_name=effective_display_name,
            pending_pk=pending_pk,
        )


def _invalid_verification_code_response():
    return Response(
        {"detail": "Invalid verification code."},
        status=status.HTTP_400_BAD_REQUEST,
    )


def _expired_verification_code_response():
    return Response(
        {
            "detail": (
                "Verification code has expired. Please request a new one."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _username_unavailable_response():
    return Response(
        {
            "detail": (
                "That username is no longer available. "
                "Please register again."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _email_unavailable_response():
    return Response(
        {
            "detail": (
                "That email is already associated with an account."
            )
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _verify_display_name_taken_response():
    return Response(
        {
            "display_name": [
                "That display name is no longer available. "
                "Please register again."
            ]
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _validate_pending_registration(
    pending: PendingRegistration | None,
    code: str,
) -> Response | None:
    if not pending or pending.code != code:
        return _invalid_verification_code_response()
    if pending.is_expired:
        return _expired_verification_code_response()
    if User.objects.filter(username__iexact=pending.username).exists():
        return _username_unavailable_response()
    if User.objects.filter(email__iexact=pending.email).exists():
        return _email_unavailable_response()

    effective_display_name = _effective_display_name(
        pending.username,
        pending.display_name,
    )
    if User.objects.filter(display_name__iexact=effective_display_name).exists():
        return _verify_display_name_taken_response()
    return None


def _create_user_from_pending(pending: PendingRegistration):
    user = User(
        username=pending.username,
        email=pending.email,
        display_name=pending.display_name,
        is_active=True,
    )
    user.password = pending.password_hash
    user.save()
    pending.delete()
    return user


def _activation_integrity_error_response(email: str) -> Response:
    pending = PendingRegistration.objects.filter(email__iexact=email).first()
    if pending is None:
        return _invalid_verification_code_response()
    if User.objects.filter(username__iexact=pending.username).exists():
        return _username_unavailable_response()
    if User.objects.filter(email__iexact=pending.email).exists():
        return _email_unavailable_response()

    effective_display_name = _effective_display_name(
        pending.username,
        pending.display_name,
    )
    if User.objects.filter(display_name__iexact=effective_display_name).exists():
        return _verify_display_name_taken_response()
    return _invalid_verification_code_response()


def activate_pending_registration(email: str, code: str) -> User | Response:
    try:
        with transaction.atomic():
            pending = (
                PendingRegistration.objects.select_for_update()
                .filter(email__iexact=email)
                .first()
            )
            validation_error = _validate_pending_registration(pending, code)
            if validation_error is not None:
                return validation_error
            return _create_user_from_pending(pending)
    except IntegrityError:
        return _activation_integrity_error_response(email)
