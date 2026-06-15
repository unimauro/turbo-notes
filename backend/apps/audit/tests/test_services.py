"""Request-introspection helpers and best-effort write semantics."""

from unittest.mock import patch

import pytest
from django.test import RequestFactory

from apps.audit.models import AiUsageEvent, AuthEvent
from apps.audit.services import (
    get_client_ip,
    get_user_agent,
    log_ai_usage,
    log_auth_event,
)

pytestmark = pytest.mark.django_db


class TestClientIp:
    def test_uses_first_x_forwarded_for_hop(self):
        request = RequestFactory().get(
            "/",
            HTTP_X_FORWARDED_FOR="203.0.113.7, 70.41.3.18, 150.172.238.178",
            REMOTE_ADDR="10.0.0.1",
        )
        assert get_client_ip(request) == "203.0.113.7"

    def test_falls_back_to_remote_addr_without_forwarded_header(self):
        request = RequestFactory().get("/", REMOTE_ADDR="198.51.100.22")
        assert get_client_ip(request) == "198.51.100.22"

    def test_empty_forwarded_falls_back_to_remote_addr(self):
        request = RequestFactory().get("/", HTTP_X_FORWARDED_FOR="  ", REMOTE_ADDR="10.1.2.3")
        assert get_client_ip(request) == "10.1.2.3"

    def test_returns_none_when_nothing_present(self):
        request = RequestFactory().get("/")
        request.META.pop("REMOTE_ADDR", None)
        assert get_client_ip(request) is None


class TestUserAgent:
    def test_reads_and_truncates_user_agent(self):
        request = RequestFactory().get("/", HTTP_USER_AGENT="x" * 500)
        ua = get_user_agent(request)
        assert len(ua) == 300

    def test_missing_user_agent_is_empty(self):
        request = RequestFactory().get("/")
        assert get_user_agent(request) == ""


class TestBestEffortWrites:
    def test_log_auth_event_swallows_db_errors(self):
        request = RequestFactory().get("/")
        with patch.object(AuthEvent.objects, "create", side_effect=RuntimeError("boom")):
            # Must not raise.
            log_auth_event(request, event_type=AuthEvent.EventType.REGISTER, email="a@b.com")
        assert AuthEvent.objects.count() == 0

    def test_log_ai_usage_swallows_db_errors(self):
        with patch.object(AiUsageEvent.objects, "create", side_effect=RuntimeError("boom")):
            log_ai_usage(
                user=None,
                endpoint=AiUsageEvent.Endpoint.SPEAK,
                model="tts-1",
                input_size=5,
                success=True,
            )
        assert AiUsageEvent.objects.count() == 0

    def test_log_ai_usage_nulls_anonymous_user(self):
        class Anon:
            is_authenticated = False

        log_ai_usage(
            user=Anon(),
            endpoint=AiUsageEvent.Endpoint.TRANSCRIBE,
            model="whisper-1",
            input_size=10,
            success=True,
        )
        event = AiUsageEvent.objects.get()
        assert event.user is None
