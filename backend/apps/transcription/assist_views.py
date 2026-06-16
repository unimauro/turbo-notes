"""AI "assist" endpoint (suggest a title, summarize a note).

``GET  /api/v1/assist/`` -> {"enabled": bool} so the frontend can decide
whether to show the assist affordances at all.

``POST /api/v1/assist/`` (JSON {text, action}) -> {"result": "<text>"}.
Returns 503 when no API key is configured, so the app works fully without one.
"""

from __future__ import annotations

import logging

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .assist import ALLOWED_ACTIONS, AssistError, assist

logger = logging.getLogger(__name__)

# Reject assist requests longer than this (keeps responses fast/cheap). The
# service truncates beyond this, but we reject outright to surface the limit.
ASSIST_MAX_CHARS = 8000


class AssistView(APIView):
    """AI assist: GET reports availability, POST runs a title/summary action.

    GET is public (AllowAny) so the frontend can decide whether to show the
    affordance before login flows complete; POST requires authentication.
    """

    # Caps OpenAI cost abuse; keyed by authenticated user.
    throttle_scope = "ai"

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_throttles(self):
        # Only throttle the cost-incurring POST; the public GET availability
        # probe stays unthrottled so the frontend can poll it freely.
        if self.request.method == "POST":
            return [ScopedRateThrottle()]
        return []

    @extend_schema(
        summary="Is AI assist configured?",
        description=(
            "Returns whether server-side OpenAI assist is available. When false, "
            "the frontend hides the suggest-title / summarize affordances."
        ),
        responses=OpenApiResponse(description='{"enabled": <bool>}'),
    )
    def get(self, request):
        return Response({"enabled": settings.ASSIST_ENABLED})

    @extend_schema(
        summary="Suggest a title or summarize a note (OpenAI)",
        description=(
            "Accepts JSON `{text, action}` where action is `title` or `summary`, "
            "and returns `{result}`. Requires OPENAI_API_KEY server-side; "
            "otherwise responds 503 and the frontend hides the feature."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "action": {"type": "string", "enum": sorted(ALLOWED_ACTIONS)},
                },
                "required": ["text", "action"],
            }
        },
        responses={
            200: OpenApiResponse(description='{"result": "<text>"}'),
            400: OpenApiResponse(description="Missing/empty/oversized text or invalid action"),
            502: OpenApiResponse(description="Upstream AI provider error"),
            503: OpenApiResponse(description="AI assist is not configured"),
        },
    )
    def post(self, request):
        if not settings.ASSIST_ENABLED:
            return Response(
                {"detail": "AI assist is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        text = request.data.get("text")
        if not isinstance(text, str) or not text.strip():
            return Response(
                {"detail": "No text provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(text) > ASSIST_MAX_CHARS:
            return Response(
                {"detail": f"Text is too long (max {ASSIST_MAX_CHARS} characters)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = request.data.get("action")
        if not isinstance(action, str) or action not in ALLOWED_ACTIONS:
            return Response(
                {"detail": "Unsupported action"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = assist(text, action)
        except AssistError as exc:
            logger.warning("AI assist failed: %s", exc)
            return Response(
                # Fixed message — never surface the exception text to the client
                # (the underlying provider error is chained + logged server-side).
                {"detail": "AI assist provider request failed"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"result": result})
