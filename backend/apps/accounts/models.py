import random
import uuid
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
import hashlib
import secrets
from django.conf import settings


class User(AbstractUser):
    """Custom user model for the ft_transcendence platform."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)  # enforce unique emails
    display_name = models.CharField(unique=True, max_length=50, blank=True, default="")
    avatar_url = models.URLField(max_length=500, blank=True, default="")
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
    last_activity = models.DateTimeField(default=timezone.now, db_index=True)

    # Use email as the login field alongside username
    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        """Normalize email and auto-populate display_name if missing."""
        if self.email:
            self.email = self.email.strip().lower()

        if not self.display_name:
            self.display_name = self.username

        super().save(*args, **kwargs)

    @property
    def is_oauth_user(self) -> bool:
        """True when the account is linked to at least one OAuth provider."""
        return self.oauth_accounts.exists()


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


class OAuthAccount(models.Model):
    """
    Links a third-party OAuth provider (42) to a local User.

    A user may have multiple OAuth accounts (one per provider).
    The (provider, provider_user_id) pair is unique so the same external
    account can never be linked twice.
    """

    PROVIDER_CHOICES = [
        ("42", "42 School"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="oauth_accounts",
    )
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    provider_user_id = models.CharField(max_length=100)
    access_token = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "oauth_accounts"
        unique_together = [("provider", "provider_user_id")]
        verbose_name = "OAuth Account"
        verbose_name_plural = "OAuth Accounts"

    def __str__(self):
        return f"{self.provider} – {self.user.username}"


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
    RECOVERY_CODE_LENGTH = 8  # chars per code

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
