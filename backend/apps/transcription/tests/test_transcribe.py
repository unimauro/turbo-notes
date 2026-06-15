"""Tests for the Whisper transcription endpoint.

The OpenAI client is always mocked — these tests never hit the network. The
feature flag is toggled with ``override_settings``.
"""

from io import BytesIO
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.notes.tests.factories import UserFactory
from apps.transcription.services import TranscriptionError

pytestmark = pytest.mark.django_db

TRANSCRIBE_URL = reverse("transcribe")

ENABLED = dict(OPENAI_API_KEY="sk-test", TRANSCRIPTION_ENABLED=True)
DISABLED = dict(OPENAI_API_KEY="", TRANSCRIPTION_ENABLED=False)


def audio_upload(name="clip.webm", size=1024):
    buf = BytesIO(b"x" * size)
    buf.name = name
    return buf


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def client(user) -> APIClient:
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def anon_client() -> APIClient:
    return APIClient()


class TestTranscriptionStatus:
    @override_settings(**ENABLED)
    def test_get_reports_enabled_true(self, anon_client):
        response = anon_client.get(TRANSCRIBE_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": True}

    @override_settings(**DISABLED)
    def test_get_reports_enabled_false(self, anon_client):
        response = anon_client.get(TRANSCRIBE_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": False}


class TestTranscribePost:
    @override_settings(**DISABLED)
    def test_returns_503_when_not_configured(self, client):
        response = client.post(TRANSCRIBE_URL, {"audio": audio_upload()}, format="multipart")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {"detail": "Transcription is not configured"}

    @override_settings(**ENABLED)
    def test_unauthenticated_returns_401(self, anon_client):
        response = anon_client.post(TRANSCRIBE_URL, {"audio": audio_upload()}, format="multipart")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(**ENABLED)
    def test_missing_audio_returns_400(self, client):
        response = client.post(TRANSCRIBE_URL, {}, format="multipart")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "No audio file provided"}

    @override_settings(**ENABLED, TRANSCRIPTION_MAX_BYTES=10)
    def test_oversized_audio_returns_400(self, client):
        response = client.post(
            TRANSCRIBE_URL, {"audio": audio_upload(size=100)}, format="multipart"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too large" in response.json()["detail"]

    @override_settings(**ENABLED)
    def test_empty_audio_returns_400(self, client):
        response = client.post(
            TRANSCRIBE_URL, {"audio": audio_upload(size=0)}, format="multipart"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "empty" in response.json()["detail"]

    @override_settings(**ENABLED)
    def test_unsupported_extension_returns_400(self, client):
        response = client.post(
            TRANSCRIBE_URL,
            {"audio": audio_upload(name="clip.txt")},
            format="multipart",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "Unsupported audio format"}

    @override_settings(**ENABLED)
    @patch("apps.transcription.views.transcribe", return_value="hello world")
    def test_returns_text_when_configured(self, mock_transcribe, client):
        response = client.post(TRANSCRIBE_URL, {"audio": audio_upload()}, format="multipart")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"text": "hello world"}
        assert mock_transcribe.call_count == 1

    @override_settings(**ENABLED)
    @patch(
        "apps.transcription.views.transcribe",
        side_effect=TranscriptionError("Transcription provider request failed"),
    )
    def test_upstream_error_returns_502(self, _mock, client):
        response = client.post(TRANSCRIBE_URL, {"audio": audio_upload()}, format="multipart")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.json() == {"detail": "Transcription provider request failed"}


class TestTranscribeService:
    """Exercise the service wrapper with the OpenAI client mocked."""

    @override_settings(**ENABLED, WHISPER_MODEL="whisper-1")
    def test_transcribe_calls_client_and_returns_text(self):
        from apps.transcription import services

        class FakeResult:
            text = "transcribed text"

        class FakeTranscriptions:
            def create(self, **kwargs):
                self.kwargs = kwargs
                return FakeResult()

        fake_transcriptions = FakeTranscriptions()

        class FakeClient:
            class audio:  # noqa: N801 - mirrors the SDK shape
                pass

        fake_client = FakeClient()
        fake_client.audio = type("A", (), {"transcriptions": fake_transcriptions})()

        with patch.object(services, "_build_client", return_value=fake_client):
            buf = BytesIO(b"bytes")
            text = services.transcribe(buf, "clip.webm")

        assert text == "transcribed text"
        assert fake_transcriptions.kwargs["model"] == "whisper-1"
        assert fake_transcriptions.kwargs["file"] == ("clip.webm", b"bytes")

    @override_settings(**ENABLED)
    def test_transcribe_wraps_provider_errors(self):
        from apps.transcription import services

        class Boom:
            def create(self, **kwargs):
                raise RuntimeError("boom: sk-secret-key-should-not-leak")

        fake_client = type("C", (), {"audio": type("A", (), {"transcriptions": Boom()})()})()

        with patch.object(services, "_build_client", return_value=fake_client):
            with pytest.raises(TranscriptionError) as exc:
                services.transcribe(BytesIO(b"x"), "clip.webm")

        # Error message must not leak the underlying provider detail / key.
        assert "sk-secret" not in str(exc.value)

    @override_settings(**ENABLED)
    def test_transcribe_handles_missing_text_attr(self):
        from apps.transcription import services

        class NoText:
            def create(self, **kwargs):
                return object()  # no .text attribute

        fake_client = type("C", (), {"audio": type("A", (), {"transcriptions": NoText()})()})()

        with patch.object(services, "_build_client", return_value=fake_client):
            text = services.transcribe(BytesIO(b"x"), "clip.webm")

        assert text == ""

    def test_build_client_instantiates_openai(self):
        from apps.transcription import services

        with override_settings(
            OPENAI_API_KEY="sk-test",
            OPENAI_BASE_URL="https://example.com/v1",
        ):
            with patch("openai.OpenAI") as mock_openai:
                services._build_client()

        mock_openai.assert_called_once_with(api_key="sk-test", base_url="https://example.com/v1")
