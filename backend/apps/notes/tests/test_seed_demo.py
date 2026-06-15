from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings

from apps.notes.management.commands.seed_demo import (
    DEMO_EMAIL,
    SAMPLE_NOTES,
)
from apps.notes.models import Note

User = get_user_model()
pytestmark = pytest.mark.django_db


class TestSeedDemoCommand:
    @override_settings(DEBUG=True)
    def test_creates_demo_user_with_sample_notes(self):
        out = StringIO()
        call_command("seed_demo", stdout=out)

        user = User.objects.get(username=DEMO_EMAIL)
        assert user.email == DEMO_EMAIL
        assert user.check_password("demo12345")
        assert Note.objects.filter(owner=user).count() == len(SAMPLE_NOTES)
        assert "Grocery List" in {n.title for n in Note.objects.filter(owner=user)}
        assert DEMO_EMAIL in out.getvalue()

    @override_settings(DEBUG=True)
    def test_is_idempotent_with_overwrite(self):
        call_command("seed_demo")
        # A rerun on the now-existing user must opt in with --overwrite.
        call_command("seed_demo", "--overwrite")

        user = User.objects.get(username=DEMO_EMAIL)
        # Reruns refresh the notes instead of duplicating them.
        assert Note.objects.filter(owner=user).count() == len(SAMPLE_NOTES)
        assert User.objects.filter(username=DEMO_EMAIL).count() == 1

    @override_settings(DEBUG=True)
    def test_existing_user_requires_overwrite(self):
        call_command("seed_demo")
        with pytest.raises(CommandError, match="already exists"):
            call_command("seed_demo")
        # The original notes are untouched when the rerun is refused.
        user = User.objects.get(username=DEMO_EMAIL)
        assert Note.objects.filter(owner=user).count() == len(SAMPLE_NOTES)

    @override_settings(DEBUG=True)
    def test_refuses_to_seed_over_superuser(self):
        User.objects.create_superuser(username=DEMO_EMAIL, email=DEMO_EMAIL, password="x")
        # Even with --overwrite a privileged account is never clobbered.
        with pytest.raises(CommandError, match="privileged"):
            call_command("seed_demo", "--overwrite")
        assert User.objects.get(username=DEMO_EMAIL).check_password("x")

    @override_settings(DEBUG=False)
    def test_refuses_without_force_when_debug_off(self):
        out = StringIO()
        call_command("seed_demo", stdout=out)

        assert not User.objects.filter(username=DEMO_EMAIL).exists()
        assert "Refusing to seed" in out.getvalue()

    @override_settings(DEBUG=False)
    def test_force_overrides_debug_guard(self):
        call_command("seed_demo", "--force")

        assert User.objects.filter(username=DEMO_EMAIL).exists()
        assert Note.objects.filter(owner__username=DEMO_EMAIL).count() == len(SAMPLE_NOTES)
