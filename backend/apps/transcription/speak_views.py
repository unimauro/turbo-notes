"""AI text-to-speech ("read note aloud") endpoint.

``GET  /api/v1/speak/`` -> {"enabled": bool, "voice": "<default voice>"} so the
frontend can decide whether to use server-side TTS or fall back to the browser's
free Web Speech synthesis, and learn the configured default voice.

``POST /api/v1/speak/`` (JSON {text, voice?}) -> mp3 audio (audio/mpeg).
Returns 503 when no API key is configured, so the app works fully without one.
"""

from __future__ import annotations

from django.conf import settings
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .tts import ALLOWED_VOICES, SpeechError, synthesize


class SpeakView(APIView):
    """Text-to-speech: GET reports availability, POST returns spoken audio.

    GET is public (AllowAny) so the frontend can decide its playback strategy
    before login flows complete; POST requires authentication.
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated()]
        return [AllowAny()]

    @extend_schema(
        summary="Is AI text-to-speech configured?",
        description=(
            "Returns whether server-side OpenAI TTS is available and the default "
            "voice. When disabled, the frontend uses the browser's Web Speech "
            "synthesis instead."
        ),
        responses=OpenApiResponse(description='{"enabled": <bool>, "voice": "<default voice>"}'),
    )
    def get(self, request):
        return Response({"enabled": settings.TTS_ENABLED, "voice": settings.OPENAI_TTS_VOICE})

    @extend_schema(
        summary="Read text aloud (OpenAI TTS)",
        description=(
            "Accepts JSON `{text, voice?}` and returns spoken audio as MP3 "
            "(audio/mpeg). Requires OPENAI_API_KEY server-side; otherwise responds "
            "503 and the client falls back to the browser's Web Speech synthesis."
        ),
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "voice": {"type": "string", "enum": sorted(ALLOWED_VOICES)},
                },
                "required": ["text"],
            }
        },
        responses={
            200: OpenApiResponse(description="MP3 audio (audio/mpeg)"),
            400: OpenApiResponse(description="Missing/empty/oversized text or invalid voice"),
            502: OpenApiResponse(description="Upstream TTS provider error"),
            503: OpenApiResponse(description="Text-to-speech is not configured"),
        },
    )
    def post(self, request):
        if not settings.TTS_ENABLED:
            return Response(
                {"detail": "Text-to-speech is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        text = request.data.get("text")
        if not isinstance(text, str) or not text.strip():
            return Response(
                {"detail": "No text provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(text) > settings.TTS_MAX_CHARS:
            return Response(
                {"detail": f"Text is too long (max {settings.TTS_MAX_CHARS} characters)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        voice = request.data.get("voice")
        if voice is not None:
            if not isinstance(voice, str) or voice not in ALLOWED_VOICES:
                return Response(
                    {"detail": "Unsupported voice"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            voice = settings.OPENAI_TTS_VOICE

        try:
            audio = synthesize(text, voice)
        except SpeechError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return HttpResponse(audio, content_type="audio/mpeg")
