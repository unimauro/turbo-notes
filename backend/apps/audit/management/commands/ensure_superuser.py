"""Idempotently provision an admin superuser from environment variables.

Lets production create/refresh the back-office admin without an interactive
shell. Reads ``DJANGO_SUPERUSER_EMAIL`` and ``DJANGO_SUPERUSER_PASSWORD``; if
either is unset it is a no-op (so it is safe to call unconditionally). The
email is stored as both ``username`` and ``email`` to match the auth flow.
"""

from __future__ import annotations

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Create or update a superuser from DJANGO_SUPERUSER_* env vars (idempotent)."

    def handle(self, *args, **options):
        email = (os.environ.get("DJANGO_SUPERUSER_EMAIL") or "").strip().lower()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD") or ""

        if not email or not password:
            self.stdout.write(
                "DJANGO_SUPERUSER_EMAIL/PASSWORD not set; skipping superuser provisioning."
            )
            return

        user, created = User.objects.get_or_create(
            username=email,
            defaults={"email": email},
        )
        user.email = email
        user.is_staff = True
        user.is_superuser = True
        user.set_password(password)
        user.save()

        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} superuser {email}."))
