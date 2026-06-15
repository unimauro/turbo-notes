"""Request introspection + best-effort audit writers.

The app runs behind Caddy, which sets ``X-Forwarded-For`` (client first, then
any intermediate proxies). We read the first hop and fall back to
``REMOTE_ADDR`` when the header is absent (e.g. local dev / direct hits).

All write helpers are best-effort: any failure is swallowed so audit logging
can never break login/register or the AI endpoints.
"""

from __future__ import annotations

import logging

from .models import AiUsageEvent, AuthEvent

logger = logging.getLogger(__name__)

# Cap stored user-agent to the model's column width.
_USER_AGENT_MAX = 300


def get_client_ip(request) -> str | None:
    """Return the originating client IP, honouring Caddy's X-Forwarded-For.

    Takes the first address in the (possibly comma-separated) forwarded chain;
    falls back to REMOTE_ADDR. Returns None when nothing usable is present so
    the GenericIPAddressField stays valid.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.META.get("REMOTE_ADDR") or None


def get_user_agent(request) -> str:
    """Return the request User-Agent, truncated to the column width."""
    return (request.META.get("HTTP_USER_AGENT", "") or "")[:_USER_AGENT_MAX]


def log_auth_event(request, *, event_type: str, email: str, user=None) -> None:
    """Write an AuthEvent. Best-effort: never raises."""
    try:
        AuthEvent.objects.create(
            user=user,
            email=(email or "").lower()[:254],
            event_type=event_type,
            ip=get_client_ip(request),
            user_agent=get_user_agent(request),
        )
    except Exception:  # noqa: BLE001 - audit logging must never break the request
        logger.exception("Failed to write AuthEvent (%s)", event_type)


def log_ai_usage(*, user, endpoint: str, model: str, input_size: int, success: bool) -> None:
    """Write an AiUsageEvent. Best-effort: never raises."""
    try:
        AiUsageEvent.objects.create(
            user=user if getattr(user, "is_authenticated", False) else None,
            endpoint=endpoint,
            model=model,
            input_size=int(input_size),
            success=success,
        )
    except Exception:  # noqa: BLE001 - audit logging must never break the request
        logger.exception("Failed to write AiUsageEvent (%s)", endpoint)
