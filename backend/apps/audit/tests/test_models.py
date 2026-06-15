"""Audit model string representations."""

import pytest

from apps.audit.models import AiUsageEvent, AuthEvent

pytestmark = pytest.mark.django_db


def test_auth_event_str():
    event = AuthEvent.objects.create(email="a@b.com", event_type=AuthEvent.EventType.LOGIN_SUCCESS)
    text = str(event)
    assert "login_success" in text
    assert "a@b.com" in text


def test_ai_usage_event_str_success_and_failure():
    ok = AiUsageEvent.objects.create(
        endpoint=AiUsageEvent.Endpoint.SPEAK, model="tts-1", input_size=5, success=True
    )
    fail = AiUsageEvent.objects.create(
        endpoint=AiUsageEvent.Endpoint.TRANSCRIBE, model="whisper-1", input_size=9, success=False
    )
    assert "ok" in str(ok)
    assert "speak" in str(ok)
    assert "fail" in str(fail)
