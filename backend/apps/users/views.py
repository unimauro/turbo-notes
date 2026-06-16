from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.models import AuthEvent
from apps.audit.services import log_auth_event

from .serializers import EmailTokenObtainPairSerializer, RegisterSerializer


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
        return response


@extend_schema(tags=["auth"])
class MeView(APIView):
    """GET -> 200 {id, email} for the authenticated user (401 otherwise)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({"id": user.id, "email": user.email or user.username})
