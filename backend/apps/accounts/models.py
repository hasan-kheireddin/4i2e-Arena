"""
It contains the following models:
- User: Custom user model with UUID primary key, email, display name, XP, level
- PendingRegistration: Temporary storage for registration attempts until email verification
- TOTPDevice: Stores TOTP secret and recovery codes for 2FA
- EmailVerificationToken: Single-use token for email verification and password reset

with relations:
PendingRegistration -> User (one-to-one after verification)
TOTPDevice -> User (one-to-one)
EmailVerificationToken -> User (many-to-one)
"""

import random
import uuid
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Value
from django.db.models.functions import Coalesce, Lower, NullIf
from django.utils import timezone
import hashlib
import secrets
from django.conf import settings


class User(AbstractUser):
    """Custom user model for the ft_transcendence platform."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    display_name = models.CharField(unique=True, max_length=50, blank=True, default="")
    preferred_language = models.CharField(
        max_length=5,
        choices=[
            ("en", "English"),
            ("fr", "French"),
            ("de", "German"),
            ("ar", "Arabic"),
        ],
        default="en",
    )
    xp = models.PositiveIntegerField(default=0, db_index=True)
    level = models.PositiveIntegerField(default=1, db_index=True)
    is_2fa_enabled = models.BooleanField(default=False)
    # Override the default username field to enforce case-insensitive uniqueness used at level of the database constraints.
    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"
        constraints = [
            models.UniqueConstraint(
                Lower("username"),
                name="accounts_user_username_ci_uniq",
            ),
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_uniq",
            ),
            models.UniqueConstraint(
                Lower("display_name"),
                name="accounts_user_display_name_ci_uniq",
            ),
        ]

    def __str__(self):
        return self.username
    # Override the save method to normalize email and auto-populate display_name if missing.
    def save(self, *args, **kwargs):
        """Normalize email and auto-populate display_name if missing."""
        if self.email:
            self.email = self.email.strip().lower()

        if not self.display_name:
            self.display_name = self.username

        super().save(*args, **kwargs)

class PendingRegistration(models.Model):
    """
    Stores a registration attempt until the user proves email ownership.

    A real User row is created only after a valid OTP is submitted.
    """

    username = models.CharField(max_length=30, unique=True)
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=50, blank=True, default="")
    password_hash = models.CharField(max_length=128)
    code = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pending_registrations"
        verbose_name = "Pending Registration"
        verbose_name_plural = "Pending Registrations"
        constraints = [
            models.UniqueConstraint(
                Lower("username"),
                name="accounts_pending_username_ci_uniq",
            ),
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_pending_email_ci_uniq",
            ),
            models.UniqueConstraint(
                Lower(Coalesce(NullIf("display_name", Value("")), "username")),
                name="accounts_pending_effective_display_ci_uniq",
            ),
        ]

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()
        if self.username:
            self.username = self.username.strip()
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def issue_code(self) -> None:
        self.code = str(random.randint(100000, 999999))
        self.expires_at = timezone.now() + timezone.timedelta(minutes=15)


class TOTPDevice(models.Model):
    """
    Stores the TOTP secret and recovery codes for a user's 2FA setup.

    Each user may have at most one TOTPDevice (OneToOne via unique user FK).
    The secret is encrypted at rest using Django's SECRET_KEY as the
    encryption key (Fernet symmetric encryption).

    Recovery codes are single-use backup codes stored as a JSON list of
    hashed values. When a code is used it is removed from the list.
    """

    RECOVERY_CODE_COUNT = 8
    RECOVERY_CODE_LENGTH = 12  # 48 bits of entropy per single-use code

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "User",
        on_delete=models.CASCADE,
        related_name="totp_device",
    )
    # Encrypted TOTP secret (base32, 32 chars)
    encrypted_secret = models.TextField()
    # JSON list of SHA-256 hashed recovery codes
    recovery_codes = models.JSONField(default=list, blank=True)
    confirmed = models.BooleanField(
        default=False,
        help_text="True once the user has verified the setup with a valid TOTP code.",
    )
    last_timestep = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="Last accepted TOTP counter; prevents code replay.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "totp_devices"
        verbose_name = "TOTP Device"
        verbose_name_plural = "TOTP Devices"

    def __str__(self):
        status = "confirmed" if self.confirmed else "pending"
        return f"TOTP({self.user.username}, {status})"

    @staticmethod
    def _derive_key() -> bytes:
        """Derive a 32-byte Fernet key from Django's SECRET_KEY."""
        import base64
        dk = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        return base64.urlsafe_b64encode(dk)

    def set_secret(self, plain_secret: str) -> None:
        """Encrypt and store the TOTP secret."""
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        self.encrypted_secret = f.encrypt(plain_secret.encode()).decode()

    def get_secret(self) -> str:
        """Decrypt and return the TOTP secret."""
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        return f.decrypt(self.encrypted_secret.encode()).decode()

    def generate_recovery_codes(self) -> list[str]:
        """
        Generate a fresh set of plaintext recovery codes, store their
        SHA-256 hashes, and return the plaintext codes to show the user.
        """
        codes: list[str] = []
        hashed: list[str] = []
        for _ in range(self.RECOVERY_CODE_COUNT):
            code = secrets.token_hex(self.RECOVERY_CODE_LENGTH // 2).upper()
            codes.append(code)
            hashed.append(hashlib.sha256(code.encode()).hexdigest())
        self.recovery_codes = hashed
        return codes

    def verify_recovery_code(self, code: str) -> bool:
        """
        Check a recovery code. If valid, remove it (single-use) and
        return True. Otherwise return False.
        """
        code_hash = hashlib.sha256(code.strip().upper().encode()).hexdigest()
        if code_hash in self.recovery_codes:
            self.recovery_codes.remove(code_hash)
            self.save(update_fields=["recovery_codes"])
            return True
        return False

    @property
    def remaining_recovery_codes(self) -> int:
        return len(self.recovery_codes)


class EmailVerificationToken(models.Model):
    """
    Single-use token for:
      - email_verify : 6-digit OTP sent after registration (15 min TTL)
      - password_reset : UUID token sent for password reset (30 min TTL)
    """

    TYPE_EMAIL_VERIFY = "email_verify"
    TYPE_PASSWORD_RESET = "password_reset"
    TOKEN_TYPE_CHOICES = [
        (TYPE_EMAIL_VERIFY, "Email Verification"),
        (TYPE_PASSWORD_RESET, "Password Reset"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "User",
        on_delete=models.CASCADE,
        related_name="verification_tokens",
    )
    token_type = models.CharField(max_length=20, choices=TOKEN_TYPE_CHOICES)
    code = models.CharField(max_length=100)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_verification_tokens"
        verbose_name = "Email Verification Token"
        verbose_name_plural = "Email Verification Tokens"
        indexes = [
            models.Index(fields=["user", "token_type", "used"]),
        ]

    def __str__(self):
        return f"{self.token_type} – {self.user.username}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    @classmethod
    def create_otp(cls, user) -> "EmailVerificationToken":
        """Create a 6-digit OTP for email verification (15-min TTL)."""
        # Invalidate any existing unused tokens for this user/type
        cls.objects.filter(
            user=user,
            token_type=cls.TYPE_EMAIL_VERIFY,
            used=False,
        ).update(used=True)

        code = str(random.randint(100000, 999999))
        return cls.objects.create(
            user=user,
            token_type=cls.TYPE_EMAIL_VERIFY,
            code=code,
            expires_at=timezone.now() + timezone.timedelta(minutes=15),
        )

    @classmethod
    def create_reset_token(cls, user) -> "EmailVerificationToken":
        """Create a UUID reset token for password reset (30-min TTL)."""
        cls.objects.filter(
            user=user,
            token_type=cls.TYPE_PASSWORD_RESET,
            used=False,
        ).update(used=True)

        code = uuid.uuid4().hex
        return cls.objects.create(
            user=user,
            token_type=cls.TYPE_PASSWORD_RESET,
            code=code,
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )
