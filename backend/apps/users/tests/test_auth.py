import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

User = get_user_model()

REGISTER_URL = reverse("auth-register")
TOKEN_URL = reverse("auth-token")
REFRESH_URL = reverse("auth-token-refresh")
RESET_URL = reverse("auth-password-reset")
ME_URL = reverse("auth-me")

EMAIL = "ada@example.com"
PASSWORD = "correct-horse-9"


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def register(client, email=EMAIL, password=PASSWORD):
    return client.post(REGISTER_URL, {"email": email, "password": password}, format="json")


class TestRegister:
    def test_register_returns_201_with_id_and_email(self, client):
        response = register(client)
        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["email"] == EMAIL
        assert set(body) == {"id", "email"}  # password never echoed back
        user = User.objects.get(pk=body["id"])
        assert user.username == EMAIL  # email doubles as username
        assert user.check_password(PASSWORD)

    def test_email_is_normalized_to_lowercase(self, client):
        response = register(client, email="Ada@Example.COM")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["email"] == EMAIL

    def test_duplicate_email_returns_400(self, client):
        register(client)
        response = register(client, email="ADA@example.com")  # case-insensitive dup
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json() == {"email": ["A user with this email already exists."]}

    def test_invalid_email_returns_400(self, client):
        response = register(client, email="not-an-email")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in response.json()

    @pytest.mark.parametrize("weak", ["short", "12345678", "password"])
    def test_weak_password_rejected_by_django_validators(self, client, weak):
        response = register(client, password=weak)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "password" in response.json()

    def test_missing_fields_return_400(self, client):
        response = client.post(REGISTER_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert set(response.json()) == {"email", "password"}


class TestTokenObtain:
    def test_valid_credentials_return_token_pair(self, client):
        register(client)
        response = client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert set(response.json()) == {"access", "refresh"}

    def test_login_is_case_insensitive_on_email(self, client):
        register(client)
        response = client.post(
            TOKEN_URL, {"email": "ADA@example.com", "password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK

    def test_wrong_password_returns_401(self, client):
        register(client)
        response = client.post(
            TOKEN_URL, {"email": EMAIL, "password": "wrong-pass-1"}, format="json"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unknown_email_returns_401(self, client):
        response = client.post(
            TOKEN_URL, {"email": "ghost@example.com", "password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPasswordReset:
    NEW_PASSWORD = "fresh-horse-7"

    def test_reset_changes_password_and_allows_login(self, client):
        register(client)
        response = client.post(
            RESET_URL, {"email": EMAIL, "password": self.NEW_PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        # Old password no longer works...
        old = client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        assert old.status_code == status.HTTP_401_UNAUTHORIZED
        # ...and the new one does.
        new = client.post(TOKEN_URL, {"email": EMAIL, "password": self.NEW_PASSWORD}, format="json")
        assert new.status_code == status.HTTP_200_OK

    def test_reset_is_case_insensitive_on_email(self, client):
        register(client)
        response = client.post(
            RESET_URL, {"email": "ADA@example.com", "password": self.NEW_PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        user = User.objects.get(username=EMAIL)
        assert user.check_password(self.NEW_PASSWORD)

    def test_unknown_email_returns_generic_200_without_creating_user(self, client):
        # No enumeration: same 200 whether or not the account exists.
        response = client.post(
            RESET_URL, {"email": "ghost@example.com", "password": self.NEW_PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert not User.objects.filter(username="ghost@example.com").exists()

    @pytest.mark.parametrize("weak", ["short", "12345678", "password"])
    def test_weak_password_rejected(self, client, weak):
        register(client)
        response = client.post(RESET_URL, {"email": EMAIL, "password": weak}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "password" in response.json()
        # The original password must remain valid after a rejected reset.
        assert User.objects.get(username=EMAIL).check_password(PASSWORD)

    def test_missing_fields_return_400(self, client):
        response = client.post(RESET_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert set(response.json()) == {"email", "password"}

    def test_reset_writes_audit_event(self, client):
        from apps.audit.models import AuthEvent

        register(client)
        client.post(RESET_URL, {"email": EMAIL, "password": self.NEW_PASSWORD}, format="json")
        event = AuthEvent.objects.filter(
            email=EMAIL, event_type=AuthEvent.EventType.PASSWORD_RESET
        ).first()
        assert event is not None

    def test_unknown_email_writes_no_audit_event(self, client):
        from apps.audit.models import AuthEvent

        client.post(
            RESET_URL, {"email": "ghost@example.com", "password": self.NEW_PASSWORD}, format="json"
        )
        assert not AuthEvent.objects.filter(event_type=AuthEvent.EventType.PASSWORD_RESET).exists()


class TestTokenRefresh:
    def test_refresh_returns_new_access_token(self, client):
        register(client)
        tokens = client.post(
            TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json"
        ).json()
        response = client.post(REFRESH_URL, {"refresh": tokens["refresh"]}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.json()

    def test_garbage_refresh_token_returns_401(self, client):
        response = client.post(REFRESH_URL, {"refresh": "not-a-token"}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestJwtEndToEnd:
    def test_access_token_grants_api_access(self, client):
        register(client)
        tokens = client.post(
            TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json"
        ).json()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        response = client.get(reverse("note-list"))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["count"] == 0


class TestMe:
    def test_returns_id_and_email_when_authenticated(self, client):
        body = register(client).json()
        tokens = client.post(
            TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json"
        ).json()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        response = client.get(ME_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"id": body["id"], "email": EMAIL}

    def test_requires_authentication(self, client):
        response = client.get(ME_URL)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestAuthThrottle:
    def test_login_brute_force_is_throttled_after_10_requests(self, client):
        # Unknown account -> 401 each time, isolating the "auth" scope to the
        # login endpoint (no register call, which shares the same IP counter).
        creds = {"email": "ghost@example.com", "password": "wrong-pass-1"}
        # The "auth" scope allows 10/min; the 11th attempt must be blocked.
        for _ in range(10):
            response = client.post(TOKEN_URL, creds, format="json")
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        blocked = client.post(TOKEN_URL, creds, format="json")
        assert blocked.status_code == status.HTTP_429_TOO_MANY_REQUESTS


class TestCookieAuth:
    """The browser SPA authenticates via httpOnly cookies (set alongside the
    token body). The test client persists Set-Cookie, so we exercise the full
    cookie path without ever touching the Authorization header."""

    def test_login_sets_httponly_samesite_auth_cookies(self, client):
        from apps.users.cookies import ACCESS_COOKIE, REFRESH_COOKIE

        register(client)
        response = client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        assert response.status_code == status.HTTP_200_OK
        for name in (ACCESS_COOKIE, REFRESH_COOKIE):
            assert name in response.cookies
            assert response.cookies[name]["httponly"]
            assert response.cookies[name]["samesite"] == "Lax"

    def test_access_cookie_authenticates_without_bearer_header(self, client):
        register(client)
        # Login persists the cookies on the test client; no Authorization header.
        client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        response = client.get(ME_URL)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["email"] == EMAIL

    def test_refresh_reads_the_cookie_and_reissues_an_access_cookie(self, client):
        from apps.users.cookies import ACCESS_COOKIE

        register(client)
        client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        # Empty body — the refresh cookie carries the token.
        response = client.post(REFRESH_URL, {}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert ACCESS_COOKIE in response.cookies

    def test_logout_clears_the_auth_cookies(self, client):
        from apps.users.cookies import ACCESS_COOKIE, REFRESH_COOKIE

        register(client)
        client.post(TOKEN_URL, {"email": EMAIL, "password": PASSWORD}, format="json")
        response = client.post(reverse("auth-logout"))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        # delete_cookie expires them (empty value).
        assert response.cookies[ACCESS_COOKIE].value == ""
        assert response.cookies[REFRESH_COOKIE].value == ""
