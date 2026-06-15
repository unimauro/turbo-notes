"""AI speech-to-text (Whisper) endpoint.

``GET  /api/v1/transcribe/`` -> {"enabled": bool} so the frontend can decide
whether to record-for-Whisper or fall back to free Web Speech dictation.

``POST /api/v1/transcribe/`` (multipart "audio") -> {"text": "<transcript>"}.
Returns 503 when no API key is configured, so the app works fully without one.
"""

from __future__ import annotations

import os

from django.conf import settings
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .services import TranscriptionError, transcribe

# Accepted audio extensions (mirrors what Whisper supports).
ALLOWED_EXTENSIONS = {".webm", ".ogg", ".oga", ".mp3", ".mpeg", ".mpga", ".wav", ".m4a", ".mp4"}


class TranscribeView(APIView):
    """Whisper transcription: GET reports availability, POST transcribes audio.

    GET is public (AllowAny) so the frontend can decide its capture strategy
    before login flows complete; POST requires authentication.
    """

    parser_classes = [MultiPartParser, FormParser]
    # Caps OpenAI (Whisper) cost abuse; keyed by authenticated user.
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
        summary="Is AI transcription configured?",
        description=(
            "Returns whether server-side Whisper transcription is available. "
            "When false, the frontend uses free in-browser Web Speech dictation."
        ),
        responses=OpenApiResponse(description='{"enabled": <bool>}'),
    )
    def get(self, request):
        return Response({"enabled": settings.TRANSCRIPTION_ENABLED})

    @extend_schema(
        summary="Transcribe audio to text (Whisper)",
        description=(
            "Accepts a multipart upload with an `audio` file and returns the "
            "transcript. Requires OPENAI_API_KEY to be configured server-side; "
            "otherwise responds 503 and the client falls back to Web Speech."
        ),
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {"audio": {"type": "string", "format": "binary"}},
                "required": ["audio"],
            }
        },
        responses={
            200: OpenApiResponse(description='{"text": "<transcript>"}'),
            400: OpenApiResponse(description="Missing/invalid/oversized audio file"),
            502: OpenApiResponse(description="Upstream transcription provider error"),
            503: OpenApiResponse(description="Transcription is not configured"),
        },
    )
    def post(self, request):
        if not settings.TRANSCRIPTION_ENABLED:
            return Response(
                {"detail": "Transcription is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        audio = request.FILES.get("audio")
        if audio is None:
            return Response(
                {"detail": "No audio file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio.size > settings.TRANSCRIPTION_MAX_BYTES:
            return Response(
                {"detail": "Audio file is too large (max 25MB)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _, ext = os.path.splitext(audio.name or "")
        if ext.lower() not in ALLOWED_EXTENSIONS:
            return Response(
                {"detail": "Unsupported audio format"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            text = transcribe(audio, audio.name or "audio.webm")
        except TranscriptionError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"text": text})
