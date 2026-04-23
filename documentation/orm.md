# ORM Audit and Documentation

## 1. ORM Usage Verification

This backend uses Django ORM for database structure and data access.

What was verified:
- Database schema is defined with Django models in `models.py` files.
- Relationships are expressed with ORM fields such as `ForeignKey` and `OneToOneField`.
- CRUD operations are performed with ORM methods like `.create()`, `.get()`, `.filter()`, `.update()`, `.delete()`, `.select_related()`, `.prefetch_related()`, `.annotate()`, and `.aggregate()`.
- Integrity is enforced with model constraints such as `unique=True`, `unique_together`, `null=True`, `blank=True`, defaults, indexes, and choice fields.

Raw SQL check:
- No raw SQL database access was found through `connection.cursor()`, `cursor.execute()`, `Model.objects.raw()`, or `RawSQL`.
- The only `.execute()` matches in the codebase are Redis pipeline calls in matchmaking, not SQL queries.

Model files located:
- [backend/apps/accounts/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/models.py)
- [backend/apps/games/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/models.py)
- [backend/apps/analytics/models.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/analytics/models.py)

## 2. Relationship Overview

Main entity relationships:
- `User` → `OAuthAccount`: one-to-many
- `User` → `EmailVerificationToken`: one-to-many
- `User` → `TOTPDevice`: one-to-one
- `User` → `Match` through `winner`: one-to-many nullable foreign key
- `User` → `MatchPlayer`: one-to-many
- `Match` → `MatchPlayer`: one-to-many
- `User` → `AchievementUnlock`: one-to-many
- `Achievement` → `AchievementUnlock`: one-to-many
- `User` → `AchievementProgress`: one-to-many
- `Achievement` → `AchievementProgress`: one-to-many
- `User` → `ActivityEvent`: one-to-many

This gives a coherent relational structure for:
- authentication and account state
- 2FA and OAuth identity linking
- game match history and participant records
- achievements and progress tracking
- analytics and activity logs

## 3. Accounts Models

## Model: User

Purpose:
- Custom authentication model for platform users.
- Extends Django `AbstractUser`.
- Central parent entity for auth, games, achievements, and activity tracking.

Fields:
- `id`: `UUIDField`, primary key, default `uuid.uuid4`, `editable=False`
- `email`: `EmailField`, `unique=True`
- `display_name`: `CharField(max_length=50)`, `unique=True`, `blank=True`, `default=""`
- `avatar_url`: `URLField(max_length=500)`, `blank=True`, `default=""`
- `preferred_language`: `CharField(max_length=5)`, choices `en/fr/ar`, default `"en"`
- `xp`: `PositiveIntegerField`, default `0`, `db_index=True`
- `level`: `PositiveIntegerField`, default `1`, `db_index=True`
- `is_2fa_enabled`: `BooleanField`, default `False`
- `last_activity`: `DateTimeField`, default `timezone.now`, `db_index=True`

Constraints and behavior:
- Email is unique.
- Display name is unique.
- `save()` normalizes email to lowercase and auto-fills empty display name with username.

Code:
```python
class User(AbstractUser):
    """Custom user model for the ft_transcendence platform."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)  # enforce unique emails
    display_name = models.CharField(unique=True, max_length=50, blank=True, default="")
    avatar_url = models.URLField(max_length=500, blank=True, default="")
    preferred_language = models.CharField(
        max_length=5,
        choices=[("en", "English"), ("fr", "French"), ("ar", "Arabic")],
        default="en",
    )
    xp = models.PositiveIntegerField(default=0, db_index=True)
    level = models.PositiveIntegerField(default=1, db_index=True)
    is_2fa_enabled = models.BooleanField(default=False)
    last_activity = models.DateTimeField(default=timezone.now, db_index=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        db_table = "users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.strip().lower()

        if not self.display_name:
            self.display_name = self.username

        super().save(*args, **kwargs)

    @property
    def is_online(self) -> bool:
        if not self.last_activity:
            return False
        return timezone.now() - self.last_activity <= timezone.timedelta(minutes=2)

    @property
    def is_oauth_user(self) -> bool:
        return self.oauth_accounts.exists()
```

## Model: OAuthAccount

Purpose:
- Links an external OAuth provider account to a local `User`.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="oauth_accounts"`
- `provider`: `CharField(max_length=20)`, choices currently only `"42"`
- `provider_user_id`: `CharField(max_length=100)`
- `access_token`: `TextField`, `blank=True`, `default=""`
- `created_at`: `DateTimeField`, `auto_now_add=True`

Constraints:
- `unique_together = [("provider", "provider_user_id")]`
- Prevents the same external identity from being linked twice.

Code:
```python
class OAuthAccount(models.Model):
    """
    Links a third-party OAuth provider (42) to a local User.
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
```

## Model: TOTPDevice

Purpose:
- Stores the 2FA secret and recovery-code state for one user.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `OneToOneField(User)`, `on_delete=models.CASCADE`, `related_name="totp_device"`
- `encrypted_secret`: `TextField`
- `recovery_codes`: `JSONField`, `default=list`, `blank=True`
- `confirmed`: `BooleanField`, default `False`
- `created_at`: `DateTimeField`, `auto_now_add=True`

Constraints:
- One device per user because it is `OneToOneField`.

Code:
```python
class TOTPDevice(models.Model):
    """
    Stores the TOTP secret and recovery codes for a user's 2FA setup.
    """

    RECOVERY_CODE_COUNT = 8
    RECOVERY_CODE_LENGTH = 8

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        "User",
        on_delete=models.CASCADE,
        related_name="totp_device",
    )
    encrypted_secret = models.TextField()
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
        import base64
        dk = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        return base64.urlsafe_b64encode(dk)

    def set_secret(self, plain_secret: str) -> None:
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        self.encrypted_secret = f.encrypt(plain_secret.encode()).decode()

    def get_secret(self) -> str:
        from cryptography.fernet import Fernet
        f = Fernet(self._derive_key())
        return f.decrypt(self.encrypted_secret.encode()).decode()

    def generate_recovery_codes(self) -> list[str]:
        codes: list[str] = []
        hashed: list[str] = []
        for _ in range(self.RECOVERY_CODE_COUNT):
            code = secrets.token_hex(self.RECOVERY_CODE_LENGTH // 2).upper()
            codes.append(code)
            hashed.append(hashlib.sha256(code.encode()).hexdigest())
        self.recovery_codes = hashed
        return codes

    def verify_recovery_code(self, code: str) -> bool:
        code_hash = hashlib.sha256(code.strip().upper().encode()).hexdigest()
        if code_hash in self.recovery_codes:
            self.recovery_codes.remove(code_hash)
            self.save(update_fields=["recovery_codes"])
            return True
        return False

    @property
    def remaining_recovery_codes(self) -> int:
        return len(self.recovery_codes)
```

## Model: EmailVerificationToken

Purpose:
- Stores one-time tokens for email verification and password reset.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="verification_tokens"`
- `token_type`: `CharField(max_length=20)`, choices `email_verify/password_reset`
- `code`: `CharField(max_length=100)`
- `expires_at`: `DateTimeField`
- `used`: `BooleanField`, default `False`
- `created_at`: `DateTimeField`, `auto_now_add=True`

Constraints:
- Indexed by `["user", "token_type", "used"]`

Code:
```python
class EmailVerificationToken(models.Model):
    """
    Single-use token for email verification and password reset.
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
```

## 4. Games Models

Supporting enums:
- `GameType`
- `FinishReason`
- `MatchOutcome`
- `GameMode`

These are implemented with `models.TextChoices`, which keeps the schema ORM-defined and strongly constrained.

## Model: Match

Purpose:
- Persistent record for one completed game session.

Fields:
- `id`: `UUIDField`, primary key
- `game_session_id`: `CharField(max_length=64)`, `unique=True`, `db_index=True`
- `game_type`: `CharField(max_length=12)`, choices `GameType`, `db_index=True`
- `game_mode`: `CharField(max_length=12)`, choices `GameMode`, default `PVP`, `db_index=True`
- `finish_reason`: `CharField(max_length=24)`, choices `FinishReason`, `db_index=True`
- `winner`: `ForeignKey(User)`, `on_delete=models.SET_NULL`, `null=True`, `blank=True`, `related_name="won_matches"`
- `started_at`: `DateTimeField`
- `finished_at`: `DateTimeField`
- `duration_seconds`: `FloatField`, default `0.0`
- `player1_score`: `IntegerField`, default `0`
- `player2_score`: `IntegerField`, default `0`
- `ai_difficulty`: `CharField(max_length=20)`, `blank=True`, `default=""`
- `metadata`: `JSONField`, `default=dict`, `blank=True`
- `created_at`: `DateTimeField`, `auto_now_add=True`

Indexes:
- `[-finished_at]`
- `["game_type", "-finished_at"]`
- `["game_mode", "-finished_at"]`

Code:
```python
class Match(models.Model):
    """
    Persistent record of a completed game session.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    game_session_id = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="In-memory session ID from GameSession.game_id.",
    )
    game_type = models.CharField(
        max_length=12,
        choices=GameType.choices,
        db_index=True,
    )
    game_mode = models.CharField(
        max_length=12,
        choices=GameMode.choices,
        default=GameMode.PVP,
        db_index=True,
    )
    finish_reason = models.CharField(
        max_length=24,
        choices=FinishReason.choices,
        db_index=True,
    )
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_matches",
    )
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    duration_seconds = models.FloatField(default=0.0)
    player1_score = models.IntegerField(default=0)
    player2_score = models.IntegerField(default=0)
    ai_difficulty = models.CharField(max_length=20, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "matches"
        ordering = ["-finished_at"]
        indexes = [
            models.Index(fields=["-finished_at"], name="idx_match_finished"),
            models.Index(fields=["game_type", "-finished_at"], name="idx_match_type_finished"),
            models.Index(fields=["game_mode", "-finished_at"], name="idx_match_mode_finished"),
        ]

    def __str__(self) -> str:
        return f"Match {self.game_session_id} ({self.game_type})"
```

## Model: MatchPlayer

Purpose:
- Join table between `Match` and `User`.
- Stores per-user match outcome, score, slot, and XP.

Fields:
- `id`: `UUIDField`, primary key
- `match`: `ForeignKey(Match)`, `on_delete=models.CASCADE`, `related_name="players"`
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="match_participations"`
- `slot`: `PositiveSmallIntegerField`
- `outcome`: `CharField(max_length=6)`, choices `MatchOutcome`, `db_index=True`
- `score`: `IntegerField`, default `0`
- `xp_earned`: `PositiveIntegerField`, default `0`

Constraints:
- `unique_together = [("match", "user")]`
- Index on `["user", "match"]`

Code:
```python
class MatchPlayer(models.Model):
    """
    Records a single player's participation in a match.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    match = models.ForeignKey(
        Match,
        on_delete=models.CASCADE,
        related_name="players",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="match_participations",
    )
    slot = models.PositiveSmallIntegerField(
        help_text="Player slot in the game (1 or 2).",
    )
    outcome = models.CharField(
        max_length=6,
        choices=MatchOutcome.choices,
        db_index=True,
    )
    score = models.IntegerField(
        default=0,
        help_text="Player's final score (points in Pong, N/A for TTT).",
    )
    xp_earned = models.PositiveIntegerField(
        default=0,
        help_text="XP awarded for this match.",
    )

    class Meta:
        db_table = "match_players"
        unique_together = [("match", "user")]
        ordering = ["slot"]
        indexes = [
            models.Index(fields=["user", "match"], name="idx_mp_user_match"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.match.game_session_id} (slot {self.slot})"
```

## 5. Analytics Models

Supporting enums:
- `AchievementCategory`
- `AchievementTier`
- `EventCategory`

## Model: Achievement

Purpose:
- Static catalog definition for achievements.

Fields:
- `id`: `UUIDField`, primary key
- `key`: `CharField(max_length=60)`, `unique=True`, `db_index=True`
- `name`: `CharField(max_length=120)`
- `description`: `TextField`
- `category`: `CharField(max_length=20)`, choices `AchievementCategory`, default `MILESTONE`, `db_index=True`
- `tier`: `CharField(max_length=12)`, choices `AchievementTier`, default `BRONZE`
- `icon`: `CharField(max_length=60)`, `blank=True`, `default="trophy"`
- `xp_reward`: `PositiveIntegerField`, default `0`
- `threshold`: `PositiveIntegerField`, default `1`
- `is_hidden`: `BooleanField`, default `False`
- `ordering_priority`: `PositiveIntegerField`, default `0`
- `created_at`: `DateTimeField`, `auto_now_add=True`

Code:
```python
class Achievement(models.Model):
    """
    Static definition of an achievement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(
        max_length=60,
        unique=True,
        db_index=True,
        help_text="Unique programmatic identifier (e.g. 'first_win').",
    )
    name = models.CharField(max_length=120)
    description = models.TextField(help_text="Player-facing description of how to unlock.")
    category = models.CharField(
        max_length=20,
        choices=AchievementCategory.choices,
        default=AchievementCategory.MILESTONE,
        db_index=True,
    )
    tier = models.CharField(
        max_length=12,
        choices=AchievementTier.choices,
        default=AchievementTier.BRONZE,
    )
    icon = models.CharField(max_length=60, blank=True, default="trophy")
    xp_reward = models.PositiveIntegerField(default=0)
    threshold = models.PositiveIntegerField(default=1)
    is_hidden = models.BooleanField(default=False)
    ordering_priority = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "achievements"
        ordering = ["category", "ordering_priority", "name"]
        verbose_name = "Achievement"
        verbose_name_plural = "Achievements"
```

## Model: AchievementUnlock

Purpose:
- Stores the fact that a user unlocked a specific achievement.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="achievement_unlocks"`
- `achievement`: `ForeignKey(Achievement)`, `on_delete=models.CASCADE`, `related_name="unlocks"`
- `unlocked_at`: `DateTimeField`, default `timezone.now`, `db_index=True`
- `game_session_id`: `CharField(max_length=100)`, `blank=True`, `default=""`

Constraints:
- `unique_together = [("user", "achievement")]`

Code:
```python
class AchievementUnlock(models.Model):
    """
    Records the moment a user unlocks a specific achievement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="achievement_unlocks",
    )
    achievement = models.ForeignKey(
        Achievement,
        on_delete=models.CASCADE,
        related_name="unlocks",
    )
    unlocked_at = models.DateTimeField(default=timezone.now, db_index=True)
    game_session_id = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "achievement_unlocks"
        unique_together = [("user", "achievement")]
        ordering = ["-unlocked_at"]
        verbose_name = "Achievement Unlock"
        verbose_name_plural = "Achievement Unlocks"
```

## Model: AchievementProgress

Purpose:
- Tracks incremental progress toward an achievement threshold.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="achievement_progress"`
- `achievement`: `ForeignKey(Achievement)`, `on_delete=models.CASCADE`, `related_name="progress_records"`
- `current`: `PositiveIntegerField`, default `0`
- `updated_at`: `DateTimeField`, `auto_now=True`

Constraints:
- `unique_together = [("user", "achievement")]`

Code:
```python
class AchievementProgress(models.Model):
    """
    Tracks incremental progress toward a threshold-based achievement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="achievement_progress",
    )
    achievement = models.ForeignKey(
        Achievement,
        on_delete=models.CASCADE,
        related_name="progress_records",
    )
    current = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "achievement_progress"
        unique_together = [("user", "achievement")]
        verbose_name = "Achievement Progress"
        verbose_name_plural = "Achievement Progress"
```

## Model: ActivityEvent

Purpose:
- Immutable event log used for activity tracking and analytics.

Fields:
- `id`: `UUIDField`, primary key
- `user`: `ForeignKey(User)`, `on_delete=models.CASCADE`, `related_name="activity_events"`, `db_index=True`
- `category`: `CharField(max_length=20)`, choices `EventCategory`, `db_index=True`
- `event_type`: `CharField(max_length=60)`, `db_index=True`
- `metadata`: `JSONField`, `default=dict`, `blank=True`
- `ip_address`: `GenericIPAddressField`, `null=True`, `blank=True`
- `user_agent`: `CharField(max_length=512)`, `blank=True`, `default=""`
- `created_at`: `DateTimeField`, default `timezone.now`, `db_index=True`

Indexes:
- `["user", "-created_at"]`
- `["category", "-created_at"]`
- `["event_type", "-created_at"]`
- `["user", "category", "-created_at"]`

Code:
```python
class ActivityEvent(models.Model):
    """
    Immutable log row for every meaningful user action.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="activity_events",
        db_index=True,
    )
    category = models.CharField(
        max_length=20,
        choices=EventCategory.choices,
        db_index=True,
    )
    event_type = models.CharField(max_length=60, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "activity_events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"], name="idx_activity_user_created"),
            models.Index(fields=["category", "-created_at"], name="idx_activity_cat_created"),
            models.Index(fields=["event_type", "-created_at"], name="idx_activity_type_created"),
            models.Index(fields=["user", "category", "-created_at"], name="idx_activity_user_cat"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} | {self.category}:{self.event_type} @ {self.created_at}"
```

## 6. Real ORM Query Examples

## Example A: Create records through ORM

Account registration and token creation:

```python
serializer = RegisterSerializer(data=request.data)
serializer.is_valid(raise_exception=True)
user = serializer.save()

user.is_active = False
user.save(update_fields=["is_active"])

token = EmailVerificationToken.create_otp(user)
```

Why this proves ORM usage:
- `serializer.save()` creates a `User` through the model layer.
- `user.save(update_fields=[...])` updates through ORM.
- `EmailVerificationToken.create_otp()` internally uses `.filter().update()` and `.create()`.

## Example B: OAuth identity lookup with relationship loading

From [backend/apps/accounts/oauth_views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/accounts/oauth_views.py):

```python
oauth = OAuthAccount.objects.select_related("user").get(
    provider=provider,
    provider_user_id=provider_user_id,
)
```

Why it matters:
- `select_related("user")` performs an ORM join on the foreign key.
- This is relational data access without raw SQL.

## Example C: Create related rows for a match

From [backend/apps/games/match_recording_service.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/match_recording_service.py):

```python
match = Match.objects.create(
    game_session_id=session.game_id,
    game_type=game_type,
    game_mode=game_mode,
    finish_reason=finish_reason,
    winner=winner_user,
    started_at=started_at,
    finished_at=finished_at,
    duration_seconds=round(max(duration, 0), 2),
    player1_score=p1_score,
    player2_score=p2_score,
    ai_difficulty=session.ai_difficulty or "",
    metadata=metadata,
)

MatchPlayer.objects.create(
    match=match,
    user_id=player_slot.user_id,
    slot=slot,
    outcome=outcome,
    score=score,
    xp_earned=int(xp_awards.get(player_slot.user_id, 0)) if xp_awards else 0,
)
```

Why it matters:
- `Match` and `MatchPlayer` are created through model classes.
- Relationships are persisted by assigning `winner=winner_user` and `match=match`.

## Example D: List matches with related objects efficiently

From [backend/apps/games/views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/views.py):

```python
qs = (
    Match.objects
    .filter(players__user=user)
    .select_related("winner")
    .prefetch_related("players__user")
    .order_by("-finished_at")
    .distinct()
)
```

Why it matters:
- `players__user` traverses the `Match -> MatchPlayer -> User` relationship chain.
- `select_related` and `prefetch_related` are standard ORM join optimization tools.

## Example E: Aggregation and analytics with ORM

From [backend/apps/games/stats_service.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/games/stats_service.py):

```python
overview = base_qs.aggregate(
    total=Count("id"),
    wins=Count("id", filter=Q(outcome="win")),
    losses=Count("id", filter=Q(outcome="loss")),
    draws=Count("id", filter=Q(outcome="draw")),
    total_xp=Coalesce(Sum("xp_earned"), 0),
    total_score=Coalesce(Sum("score"), 0),
    avg_score=Coalesce(Avg("score"), 0.0, output_field=FloatField()),
    avg_duration=Coalesce(
        Avg("match__duration_seconds"), 0.0, output_field=FloatField()
    ),
)
```

Why it matters:
- This is advanced ORM usage over relationships (`match__duration_seconds`).
- The backend is using ORM as a query engine, not just as record wrappers.

## Example F: Annotation and subqueries

From [backend/apps/analytics/views.py](/mnt/c/Users/Admin/Documents/testing/4i2e-Arena/backend/apps/analytics/views.py):

```python
unlock_sq = AchievementUnlock.objects.filter(
    user=user, achievement=OuterRef("pk"),
)
progress_sq = AchievementProgress.objects.filter(
    user=user, achievement=OuterRef("pk"),
)

qs = (
    Achievement.objects
    .filter(pk__in=visible_ids)
    .annotate(
        is_unlocked=Case(
            When(unlocks__user=user, then=Value(True)),
            default=Value(False),
            output_field=BooleanField(),
        ),
        unlocked_at=Subquery(
            unlock_sq.values("unlocked_at")[:1],
        ),
        progress_current=Subquery(
            progress_sq.values("current")[:1],
            output_field=IntegerField(),
        ),
    )
)
```

Why it matters:
- Uses `Subquery`, `OuterRef`, `Case`, and `When`.
- This is strong evidence of real ORM-driven database logic.

## 7. CRUD Coverage

Create:
- `User.objects.create_user(...)`
- `OAuthAccount.objects.create(...)`
- `Match.objects.create(...)`
- `MatchPlayer.objects.create(...)`
- `ActivityEvent.objects.create(...)`
- `AchievementUnlock.objects.create(...)`

Read:
- `.get(...)`
- `.filter(...)`
- `.exists()`
- `.count()`
- `.select_related(...)`
- `.prefetch_related(...)`
- `.values(...)`
- `.values_list(...)`

Update:
- `.save(update_fields=[...])`
- `.update(...)`
- `F(...)` expression updates in XP services

Delete:
- `.delete()`
- query-based deletes such as removing pending 2FA devices or wiping analytics rows

## 8. Integrity and Constraint Summary

Important integrity controls:
- `User.email` is unique.
- `User.display_name` is unique.
- `OAuthAccount(provider, provider_user_id)` is unique.
- `TOTPDevice.user` is one-to-one.
- `EmailVerificationToken` is indexed for active-token lookups.
- `Match.game_session_id` is unique.
- `MatchPlayer(match, user)` is unique.
- `Achievement.key` is unique.
- `AchievementUnlock(user, achievement)` is unique.
- `AchievementProgress(user, achievement)` is unique.

These constraints ensure:
- no duplicated OAuth identity mappings
- no duplicated per-user participation rows in a single match
- no duplicated achievement unlock rows
- clear, enforceable one-device-per-user 2FA model

## 9. Conclusion

This backend satisfies the ORM requirements:
- database structure is defined with Django model classes
- entity relationships are explicit and normalized
- CRUD is implemented through Django ORM, not raw SQL
- data integrity is maintained through field constraints and relationship constraints
- the codebase demonstrates both simple and advanced ORM usage, including joins, filtering across relations, aggregation, annotations, subqueries, bulk updates, and deletions

For evaluation purposes, this is a real ORM-based backend, not a schema-only or superficial ORM wrapper.
