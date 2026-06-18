"""Observability models for OWASP A09 (auth audit) and OpenAI cost visibility.

Both models are append-only audit rows written best-effort from the auth and
AI views — a write failure here must never break the user-facing request, so
the calling code wraps these in try/except. The admin registers them read-only.
"""

from django.conf import settings
from django.db import models


class AuthEvent(models.Model):
    """One row per authentication-relevant action (OWASP A09 logging).

    ``user`` is null for failed logins where the email matches no account
    (SET_NULL also keeps history after a user is deleted). ``email`` always
    records the *attempted* address (lowercased) so failed logins are visible
    even without a user row.
    """

    class EventType(models.TextChoices):
        LOGIN_SUCCESS = "login_success"
        LOGIN_FAILED = "login_failed"
        REGISTER = "register"
        PASSWORD_RESET = "password_reset"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="auth_events",
    )
    email = models.CharField(max_length=254)
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["email", "created_at"])]

    def __str__(self) -> str:
        return f"{self.event_type} {self.email} @ {self.created_at:%Y-%m-%d %H:%M:%S}"


class AiUsageEvent(models.Model):
    """One row per OpenAI call (transcribe/speak) for per-user cost visibility.

    ``input_size`` is bytes for audio (transcribe) and characters for text
    (speak); ``success`` distinguishes billable successes from failed attempts.
    """

    class Endpoint(models.TextChoices):
        TRANSCRIBE = "transcribe"
        SPEAK = "speak"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage_events",
    )
    endpoint = models.CharField(max_length=20, choices=Endpoint.choices)
    model = models.CharField(max_length=100)
    input_size = models.IntegerField(default=0)
    success = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        state = "ok" if self.success else "fail"
        return f"{self.endpoint} ({state}) {self.model} {self.input_size}"
