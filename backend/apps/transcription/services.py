"""Thin wrapper around the OpenAI-compatible audio transcription API.

Kept deliberately small and side-effect-free (no Django imports) so tests can
mock ``_build_client`` / ``transcribe`` without touching the network.
"""

from __future__ import annotations

from django.conf import settings


class TranscriptionError(Exception):
    """Raised when the upstream provider fails. The message is safe to surface
    to clients (it never includes the API key)."""


def _build_client():
    # Imported lazily so the dependency is only needed when transcription is
    # actually configured/used (and so importing this module stays cheap).
    from openai import OpenAI

    return OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)


def transcribe(file, filename: str) -> str:
    """Transcribe an uploaded audio file to text via Whisper.

    ``file`` is any file-like object with ``.read()``; ``filename`` gives the
    provider an extension hint. Returns the transcript string. Raises
    ``TranscriptionError`` on any upstream failure.
    """
    client = _build_client()
    try:
        result = client.audio.transcriptions.create(
            model=settings.WHISPER_MODEL,
            file=(filename, file.read()),
        )
    except Exception as exc:  # noqa: BLE001 - normalise any provider error
        raise TranscriptionError("Transcription provider request failed") from exc
    return getattr(result, "text", "") or ""
