"""Helpers for the JWT auth cookies.

The browser SPA authenticates via these **httpOnly** cookies (not JS-readable
localStorage), which removes the XSS token-exfiltration risk. They are set
alongside the normal token response body, so Bearer/API clients are unaffected.

SameSite=Lax is the CSRF defence: browsers do NOT attach Lax cookies to
cross-site POST/PUT/DELETE (the CSRF vector), and our state-changing endpoints
are all unsafe methods, so no separate CSRF token is needed for the same-origin
SPA. `Secure` is on whenever DEBUG is off (prod is HTTPS); off in local/dev so
the cookies work over plain-HTTP localhost.
"""

from django.conf import settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def _set(response, name: str, value: str, lifetime) -> None:
    response.set_cookie(
        name,
        value,
        max_age=int(lifetime.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax",
        path="/",
    )


def set_auth_cookies(response, *, access: str | None = None, refresh: str | None = None):
    """Attach the access and/or refresh cookies to a response."""
    if access is not None:
        _set(response, ACCESS_COOKIE, access, settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"])
    if refresh is not None:
        _set(response, REFRESH_COOKIE, refresh, settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"])
    return response


def clear_auth_cookies(response):
    """Expire both auth cookies (logout)."""
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(name, path="/", samesite="Lax")
    return response
