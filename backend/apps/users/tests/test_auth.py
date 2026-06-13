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
