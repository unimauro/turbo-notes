from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit.models import AuthEvent
from apps.audit.services import log_auth_event

from .cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from .serializers import (
    EmailTokenObtainPairSerializer,
    PasswordResetSerializer,
    RegisterSerializer,
)


@extend_schema(tags=["auth"])
class RegisterView(generics.CreateAPIView):
    """POST {email, password} -> 201 {id, email}."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # credentials-in, no token required
    # Brute-force/abuse protection: anonymous, so keyed by client IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def perform_create(self, serializer):
        user = serializer.save()
        # OWASP A09 audit trail (best-effort; never breaks registration).
        log_auth_event(
            self.request,
            event_type=AuthEvent.EventType.REGISTER,
            email=user.email,
            user=user,
        )
        return user


@extend_schema(tags=["auth"])
class EmailTokenObtainPairView(TokenObtainPairView):
    """POST {email, password} -> 200 {access, refresh}."""

    serializer_class = EmailTokenObtainPairSerializer
    # Brute-force protection on login: anonymous, so keyed by client IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        # The attempted email (used for the failed-login audit row). Lowercasing
        # mirrors the serializer; safe even when the field is missing/non-str.
        attempted = request.data.get("email")
        attempted = attempted.lower() if isinstance(attempted, str) else ""
        try:
            response = super().post(request, *args, **kwargs)
        except (AuthenticationFailed, InvalidToken, ValidationError):
            # Bad credentials: log the failure, then re-raise so the HTTP
            # response (401/400) is exactly what simplejwt would have returned.
            log_auth_event(
                request,
                event_type=AuthEvent.EventType.LOGIN_FAILED,
                email=attempted,
            )
            raise

        # On success the credentials validated, so the user exists; resolve it
        # for the audit row (username == email by the registration invariant).
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.filter(username__iexact=attempted).first()
        log_auth_event(
            request,
            event_type=AuthEvent.EventType.LOGIN_SUCCESS,
            email=attempted,
            user=user,
        )
        # Also issue the tokens as httpOnly cookies for the browser SPA (no
        # JS-readable storage → no XSS exfiltration). The body still carries the
        # tokens for Bearer/API clients.
        set_auth_cookies(
            response,
            access=response.data.get("access"),
            refresh=response.data.get("refresh"),
        )
        return response


@extend_schema(tags=["auth"])
class PasswordResetView(APIView):
    """POST {email, password} -> 200. Sets the password directly (no email).

    See ``PasswordResetSerializer`` for the (deliberate, documented) security
    tradeoff. Always returns a generic 200 so the response can't be used to
    enumerate which emails are registered.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # credentials-in, no token required
    # Same brute-force budget as login/register: anonymous, keyed by client IP.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=PasswordResetSerializer, responses={200: None})
    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if user is not None:
            # Audit only real resets; the generic response stays the same either way.
            log_auth_event(
                request,
                event_type=AuthEvent.EventType.PASSWORD_RESET,
                email=user.email,
                user=user,
            )
        return Response(
            {"detail": "If that account exists, its password has been updated."},
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["auth"])
class MeView(APIView):
    """GET -> 200 {id, email} for the authenticated user (401 otherwise)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({"id": user.id, "email": user.email or user.username})


@extend_schema(tags=["auth"])
class CookieTokenRefreshView(TokenRefreshView):
    """Refresh the access token from the refresh **cookie** (body still accepted).

    The SPA never holds the refresh token in JS, so it sends nothing — the
    httpOnly cookie carries it. We inject it into the serializer input when the
    body omits it, then re-issue the access token as a fresh cookie.
    """

    def post(self, request, *args, **kwargs):
        if not request.data.get("refresh"):
            cookie = request.COOKIES.get(REFRESH_COOKIE)
            if cookie:
                # request.data is a plain dict for JSON requests; make it mutable
                # if it's a QueryDict (form-encoded) before injecting.
                if hasattr(request.data, "_mutable"):
                    request.data._mutable = True
                request.data["refresh"] = cookie
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            set_auth_cookies(response, access=response.data.get("access"))
        return response


@extend_schema(tags=["auth"])
class LogoutView(APIView):
    """Clear the auth cookies. Safe to call without being authenticated."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        return clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))
