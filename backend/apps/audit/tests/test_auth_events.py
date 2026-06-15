"""AuthEvent (OWASP A09) logging is written without altering existing behaviour."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.audit.models import AuthEvent

pytestmark = pytest.mark.django_db

User = get_user_model()

REGISTER_URL = reverse("auth-register")
TOKEN_URL = reverse("auth-token")

EMAIL = "ada@example.com"
PASSWORD = "correct-horse-9"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def register(client, email=EMAIL, password=PASSWORD):
    return client.post(REGISTER_URL, {"email": email, "password": password}, format="json")


class TestRegisterAudit:
    def test_register_writes_register_event(self, client):
        response = register(client)
        assert response.status_code == status.HTTP_201_CREATED

        event = AuthEvent.objects.get(event_type=AuthEvent.EventType.REGISTER)
        assert event.email == EMAIL
        assert event.user is not None
        assert event.user.email == EMAIL

    def test_failed_register_writes_no_event(self, client):
        # Invalid email -> 400, and no audit row created.
        response = register(client, email="not-an-email")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert AuthEvent.objects.count() == 0


class TestLoginAudit:
    def test_successful_login_writes_login_success(self, client):
        register(client)
        response = client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        assert response.status_code == status.HTTP_200_OK

        event = AuthEvent.objects.get(event_type=AuthEvent.EventType.LOGIN_SUCCESS)
        assert event.email == EMAIL
        assert event.user is not None and event.user.email == EMAIL

    def test_login_success_event_uses_lowercased_email(self, client):
        register(client)
        response = client.post(
            TOKEN_URL, {"email": "ADA@example.com", "password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        event = AuthEvent.objects.get(event_type=AuthEvent.EventType.LOGIN_SUCCESS)
        assert event.email == EMAIL

    def test_wrong_password_writes_login_failed_and_still_401(self, client):
        register(client)
        response = client.post(
            TOKEN_URL, {"email": EMAIL, "password": "wrong-pass-1"}, format="json"
        )
        # Response is unchanged (still 401)...
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        # ...and a failure row was recorded, linked to the known user.
        event = AuthEvent.objects.get(event_type=AuthEvent.EventType.LOGIN_FAILED)
        assert event.email == EMAIL

    def test_unknown_email_writes_login_failed_with_null_user(self, client):
        response = client.post(
            TOKEN_URL, {"email": "ghost@example.com", "password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        event = AuthEvent.objects.get(event_type=AuthEvent.EventType.LOGIN_FAILED)
        assert event.email == "ghost@example.com"
        assert event.user is None
