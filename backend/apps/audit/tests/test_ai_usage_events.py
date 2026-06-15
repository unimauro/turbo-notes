"""AiUsageEvent rows are written from the transcribe/speak endpoints."""

from io import BytesIO
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import AiUsageEvent
from apps.notes.tests.factories import UserFactory
from apps.transcription.services import TranscriptionError
from apps.transcription.tts import SpeechError

pytestmark = pytest.mark.django_db

TRANSCRIBE_URL = reverse("transcribe")
SPEAK_URL = reverse("speak")

TRANSCRIBE_ENABLED = dict(
    OPENAI_API_KEY="sk-test", TRANSCRIPTION_ENABLED=True, WHISPER_MODEL="whisper-1"
)
SPEAK_ENABLED = dict(
    OPENAI_API_KEY="sk-test", TTS_ENABLED=True, OPENAI_TTS_VOICE="nova", OPENAI_TTS_MODEL="tts-1"
)


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


class TestTranscribeUsage:
    @override_settings(**TRANSCRIBE_ENABLED)
    @patch("apps.transcription.views.transcribe", return_value="hello world")
    def test_success_writes_usage_event(self, _mock, client, user):
        response = client.post(
            TRANSCRIBE_URL, {"audio": audio_upload(size=2048)}, format="multipart"
        )
        assert response.status_code == status.HTTP_200_OK

        event = AiUsageEvent.objects.get()
        assert event.endpoint == AiUsageEvent.Endpoint.TRANSCRIBE
        assert event.model == "whisper-1"
        assert event.input_size == 2048  # bytes of audio
        assert event.success is True
        assert event.user == user

    @override_settings(**TRANSCRIBE_ENABLED)
    @patch(
        "apps.transcription.views.transcribe",
        side_effect=TranscriptionError("Transcription provider request failed"),
    )
    def test_failure_writes_failed_usage_event(self, _mock, client):
        response = client.post(TRANSCRIBE_URL, {"audio": audio_upload()}, format="multipart")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY

        event = AiUsageEvent.objects.get()
        assert event.endpoint == AiUsageEvent.Endpoint.TRANSCRIBE
        assert event.success is False


class TestSpeakUsage:
    @override_settings(**SPEAK_ENABLED)
    @patch("apps.transcription.speak_views.synthesize", return_value=b"mp3")
    def test_success_writes_usage_event(self, _mock, client, user):
        response = client.post(SPEAK_URL, {"text": "hello world"}, format="json")
        assert response.status_code == status.HTTP_200_OK

        event = AiUsageEvent.objects.get()
        assert event.endpoint == AiUsageEvent.Endpoint.SPEAK
        assert event.model == "tts-1"
        assert event.input_size == len("hello world")  # chars of text
        assert event.success is True
        assert event.user == user

    @override_settings(**SPEAK_ENABLED)
    @patch(
        "apps.transcription.speak_views.synthesize",
        side_effect=SpeechError("Text-to-speech provider request failed"),
    )
    def test_failure_writes_failed_usage_event(self, _mock, client):
        response = client.post(SPEAK_URL, {"text": "hi"}, format="json")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY

        event = AiUsageEvent.objects.get()
        assert event.endpoint == AiUsageEvent.Endpoint.SPEAK
        assert event.success is False
        assert event.input_size == 2
