"""Tests for the OpenAI "assist" (suggest title / summarize) endpoint.

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
from apps.transcription.assist import AssistError

pytestmark = pytest.mark.django_db

ASSIST_URL = reverse("assist")

ENABLED = dict(OPENAI_API_KEY="sk-test", ASSIST_ENABLED=True)
DISABLED = dict(OPENAI_API_KEY="", ASSIST_ENABLED=False)


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


class TestAssistStatus:
    @override_settings(**ENABLED)
    def test_get_reports_enabled_true(self, anon_client):
        response = anon_client.get(ASSIST_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": True}

    @override_settings(**DISABLED)
    def test_get_reports_enabled_false(self, anon_client):
        response = anon_client.get(ASSIST_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"enabled": False}


class TestAssistPost:
    @override_settings(**DISABLED)
    def test_returns_503_when_not_configured(self, client):
        response = client.post(ASSIST_URL, {"text": "hi", "action": "title"}, format="json")
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.json() == {"detail": "AI assist is not configured"}

    @override_settings(**ENABLED)
    def test_unauthenticated_returns_401(self, anon_client):
        response = anon_client.post(ASSIST_URL, {"text": "hi", "action": "title"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @override_settings(**ENABLED)
    def test_empty_text_returns_400(self, client):
        response = client.post(ASSIST_URL, {"text": "   ", "action": "title"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "No text provided"}

    @override_settings(**ENABLED)
    def test_invalid_action_returns_400(self, client):
        response = client.post(ASSIST_URL, {"text": "hi", "action": "translate"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "Unsupported action"}

    @override_settings(**ENABLED)
    def test_missing_action_returns_400(self, client):
        response = client.post(ASSIST_URL, {"text": "hi"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"detail": "Unsupported action"}

    @override_settings(**ENABLED)
    def test_oversized_text_returns_400(self, client):
        from apps.transcription.assist_views import ASSIST_MAX_CHARS

        response = client.post(
            ASSIST_URL,
            {"text": "x" * (ASSIST_MAX_CHARS + 1), "action": "title"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too long" in response.json()["detail"]

    @override_settings(**ENABLED)
    @patch("apps.transcription.assist_views.assist", return_value="A Tidy Title")
    def test_title_returns_result(self, mock_assist, client):
        response = client.post(
            ASSIST_URL, {"text": "some note body", "action": "title"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"result": "A Tidy Title"}
        mock_assist.assert_called_once_with("some note body", "title")

    @override_settings(**ENABLED)
    @patch("apps.transcription.assist_views.assist", return_value="A short summary.")
    def test_summary_returns_result(self, mock_assist, client):
        response = client.post(
            ASSIST_URL, {"text": "some long note", "action": "summary"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"result": "A short summary."}
        mock_assist.assert_called_once_with("some long note", "summary")

    @override_settings(**ENABLED)
    @patch(
        "apps.transcription.assist_views.assist",
        side_effect=AssistError("AI assist provider request failed"),
    )
    def test_upstream_error_returns_502(self, _mock, client):
        response = client.post(ASSIST_URL, {"text": "hi", "action": "title"}, format="json")
        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.json() == {"detail": "AI assist provider request failed"}


class TestAssistService:
    """Exercise the service wrapper with the OpenAI client mocked."""

    @override_settings(**ENABLED, OPENAI_ASSIST_MODEL="gpt-4o-mini")
    def test_assist_calls_client_and_returns_stripped_content(self):
        from apps.transcription import assist as assist_mod

        class FakeMessage:
            content = "  Trimmed Title  "

        class FakeChoice:
            message = FakeMessage()

        class FakeResult:
            choices = [FakeChoice()]

        class FakeCompletions:
            def create(self, **kwargs):
                self.kwargs = kwargs
                return FakeResult()

        fake_completions = FakeCompletions()
        fake_client = type("C", (), {"chat": type("Ch", (), {"completions": fake_completions})()})()

        with patch.object(assist_mod, "_build_client", return_value=fake_client):
            result = assist_mod.assist("note text", "title")

        assert result == "Trimmed Title"
        assert fake_completions.kwargs["model"] == "gpt-4o-mini"
        messages = fake_completions.kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert "note titles" in messages[0]["content"]
        assert "note text" in messages[1]["content"]

    @override_settings(**ENABLED)
    def test_assist_truncates_oversized_input(self):
        from apps.transcription import assist as assist_mod

        class FakeMessage:
            content = "ok"

        class FakeChoice:
            message = FakeMessage()

        class FakeResult:
            choices = [FakeChoice()]

        class FakeCompletions:
            def create(self, **kwargs):
                self.kwargs = kwargs
                return FakeResult()

        fake_completions = FakeCompletions()
        fake_client = type("C", (), {"chat": type("Ch", (), {"completions": fake_completions})()})()

        big = "y" * 9000
        with patch.object(assist_mod, "_build_client", return_value=fake_client):
            assist_mod.assist(big, "summary")

        # Input truncated to 400 chars before being embedded in the prompt.
        assert ("y" * 9000) not in fake_completions.kwargs["messages"][1]["content"]
        assert ("y" * 400) in fake_completions.kwargs["messages"][1]["content"]

    @override_settings(**ENABLED)
    def test_assist_wraps_provider_errors(self):
        from apps.transcription import assist as assist_mod

        class Boom:
            def create(self, **kwargs):
                raise RuntimeError("boom: sk-secret-key-should-not-leak")

        fake_client = type("C", (), {"chat": type("Ch", (), {"completions": Boom()})()})()

        with patch.object(assist_mod, "_build_client", return_value=fake_client):
            with pytest.raises(AssistError) as exc:
                assist_mod.assist("hi", "title")

        assert "sk-secret" not in str(exc.value)

    def test_build_client_instantiates_openai(self):
        from apps.transcription import assist as assist_mod

        with override_settings(
            OPENAI_API_KEY="sk-test",
            OPENAI_BASE_URL="https://example.com/v1",
        ):
            with patch("openai.OpenAI") as mock_openai:
                assist_mod._build_client()

        mock_openai.assert_called_once_with(api_key="sk-test", base_url="https://example.com/v1")
