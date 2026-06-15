"""Tests for the OpenAI text-to-speech ("read note aloud") endpoint.

The OpenAI client is always mocked — these tests never hit the network. The
feature flag is toggled with ``override_settings``.
"""

from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.notes.tests.factories import UserFactory
from apps.transcription.tts import SpeechError

pytestmark = pytest.mark.django_db

SPEAK_URL = reverse("speak")

ENABLED = dict(OPENAI_API_KEY="sk-test", TTS_ENABLED=True, OPENAI_TTS_VOICE="nova")
DISABLED = dict(OPENAI_API_KEY="", TTS_ENABLED=False, OPENAI_TTS_VOICE="nova")

FAKE_MP3 = b"ID3fake-mp3-bytes"


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


class TestSpeakStatus:
    @override_settings(**ENABLED)
    def test_get_reports_enabled_true_with_voice(self, anon_client):
        response = anon_client.get(SPEAK_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": True, "voice": "nova"}

    @override_settings(**DISABLED)
    def test_get_reports_enabled_false(self, anon_client):
        response = anon_client.get(SPEAK_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": False, "voice": "nova"}


class TestSpeakPost:
    @override_settings(**DISABLED)
    def test_returns_503_when_not_configured(self, client):
        response = client.post(SPEAK_URL, {"text": "hello"}, format="json")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {"detail": "Text-to-speech is not configured"}

    @override_settings(**ENABLED)
    def test_unauthenticated_returns_401(self, anon_client):
        response = anon_client.post(SPEAK_URL, {"text": "hello"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(**ENABLED)
    def test_empty_text_returns_400(self, client):
        response = client.post(SPEAK_URL, {"text": "   "}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "No text provided"}

    @override_settings(**ENABLED)
    def test_missing_text_returns_400(self, client):
        response = client.post(SPEAK_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "No text provided"}

    @override_settings(**ENABLED, TTS_MAX_CHARS=5)
    def test_oversized_text_returns_400(self, client):
        response = client.post(SPEAK_URL, {"text": "way too long"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too long" in response.json()["detail"]

    @override_settings(**ENABLED)
    def test_invalid_voice_returns_400(self, client):
        response = client.post(SPEAK_URL, {"text": "hi", "voice": "robot"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "Unsupported voice"}

    @override_settings(**ENABLED)
    @patch("apps.transcription.speak_views.synthesize", return_value=FAKE_MP3)
    def test_returns_audio_when_configured(self, mock_synth, client):
        response = client.post(SPEAK_URL, {"text": "hello world"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "audio/mpeg"
        assert response.content == FAKE_MP3
        # Default voice is used when none is supplied.
        mock_synth.assert_called_once_with("hello world", "nova")

    @override_settings(**ENABLED)
    @patch("apps.transcription.speak_views.synthesize", return_value=FAKE_MP3)
    def test_valid_voice_override_is_passed_through(self, mock_synth, client):
        response = client.post(SPEAK_URL, {"text": "hi", "voice": "shimmer"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        mock_synth.assert_called_once_with("hi", "shimmer")

    @override_settings(**ENABLED)
    @patch(
        "apps.transcription.speak_views.synthesize",
        side_effect=SpeechError("Text-to-speech provider request failed"),
    )
    def test_upstream_error_returns_502(self, _mock, client):
        response = client.post(SPEAK_URL, {"text": "hi"}, format="json")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.json() == {"detail": "Text-to-speech provider request failed"}


class TestSpeakService:
    """Exercise the service wrapper with the OpenAI client mocked."""

    @override_settings(**ENABLED, OPENAI_TTS_MODEL="tts-1")
    def test_synthesize_calls_client_and_returns_bytes(self):
        from apps.transcription import tts

        class FakeResult:
            content = FAKE_MP3

        class FakeSpeech:
            def create(self, **kwargs):
                self.kwargs = kwargs
                return FakeResult()

        fake_speech = FakeSpeech()
        fake_client = type("C", (), {"audio": type("A", (), {"speech": fake_speech})()})()

        with patch.object(tts, "_build_client", return_value=fake_client):
            audio = tts.synthesize("read me", "nova")

        assert audio == FAKE_MP3
        assert fake_speech.kwargs["model"] == "tts-1"
        assert fake_speech.kwargs["voice"] == "nova"
        assert fake_speech.kwargs["input"] == "read me"

    @override_settings(**ENABLED)
    def test_synthesize_wraps_provider_errors(self):
        from apps.transcription import tts

        class Boom:
            def create(self, **kwargs):
                raise RuntimeError("boom: sk-secret-key-should-not-leak")

        fake_client = type("C", (), {"audio": type("A", (), {"speech": Boom()})()})()

        with patch.object(tts, "_build_client", return_value=fake_client):
            with pytest.raises(SpeechError) as exc:
                tts.synthesize("hi", "nova")

        assert "sk-secret" not in str(exc.value)

    def test_build_client_instantiates_openai(self):
        from apps.transcription import tts

        with override_settings(
            OPENAI_API_KEY="sk-test",
            OPENAI_BASE_URL="https://example.com/v1",
        ):
            with patch("openai.OpenAI") as mock_openai:
                tts._build_client()

        mock_openai.assert_called_once_with(api_key="sk-test", base_url="https://example.com/v1")
