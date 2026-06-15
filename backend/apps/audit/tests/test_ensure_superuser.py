"""ensure_superuser provisions an admin from env vars, idempotently."""

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

pytestmark = pytest.mark.django_db

User = get_user_model()

EMAIL = "admin@example.com"
PASSWORD = "sup3r-str0ng-admin!"


class TestEnsureSuperuser:
    def test_noop_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("DJANGO_SUPERUSER_EMAIL", raising=False)
        monkeypatch.delenv("DJANGO_SUPERUSER_PASSWORD", raising=False)
        call_command("ensure_superuser")
        assert User.objects.count() == 0

    def test_noop_when_only_email_set(self, monkeypatch):
        monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", EMAIL)
        monkeypatch.delenv("DJANGO_SUPERUSER_PASSWORD", raising=False)
        call_command("ensure_superuser")
        assert User.objects.count() == 0

    def test_creates_superuser_when_env_set(self, monkeypatch):
        monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "ADMIN@Example.com")
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", PASSWORD)
        call_command("ensure_superuser")

        user = User.objects.get(username=EMAIL)  # lowercased
        assert user.email == EMAIL
        assert user.is_staff is True
        assert user.is_superuser is True
        assert user.check_password(PASSWORD)

    def test_is_idempotent_and_updates_password(self, monkeypatch):
        monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", EMAIL)
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", PASSWORD)
        call_command("ensure_superuser")
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "rotated-p4ssword!")
        call_command("ensure_superuser")

        assert User.objects.filter(username=EMAIL).count() == 1
        user = User.objects.get(username=EMAIL)
        assert user.check_password("rotated-p4ssword!")
