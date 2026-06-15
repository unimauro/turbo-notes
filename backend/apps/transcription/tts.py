"""Thin wrapper around the OpenAI-compatible audio speech (TTS) API.

Kept deliberately small and side-effect-free (no Django imports beyond settings)
so tests can mock ``_build_client`` / ``synthesize`` without touching the network.
Mirrors ``services.py`` (Whisper transcription).
"""

from __future__ import annotations

from django.conf import settings

# Voices accepted by the OpenAI TTS API. Used to validate the optional override.
ALLOWED_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}


class SpeechError(Exception):
    """Raised when the upstream provider fails. The message is safe to surface
    to clients (it never includes the API key)."""


def _build_client():
    # Imported lazily so the dependency is only needed when TTS is actually
    # configured/used (and so importing this module stays cheap).
    from openai import OpenAI

    return OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)


def synthesize(text: str, voice: str) -> bytes:
    """Synthesize ``text`` to spoken-audio MP3 bytes via the TTS API.

    Returns the raw mp3 bytes. Raises ``SpeechError`` on any upstream failure.
    """
    client = _build_client()
    try:
        result = client.audio.speech.create(
            model=settings.OPENAI_TTS_MODEL,
            voice=voice,
            input=text,
        )
        # The OpenAI SDK returns an HttpxBinaryResponseContent exposing the raw
        # audio bytes via ``.content`` (also supports ``.stream_to_file``).
        audio = getattr(result, "content", None)
        if audio is None:  # pragma: no cover - defensive for odd SDK shapes
            audio = bytes(result)
    except Exception as exc:  # noqa: BLE001 - normalise any provider error
        raise SpeechError("Text-to-speech provider request failed") from exc
    return audio
