"""Seed a demo user with sample notes so the app is instantly explorable.

Usage:
    python manage.py seed_demo

Idempotent: running it again refreshes the demo user's notes without creating
duplicates. Intended for local/demo environments only (skips if DEBUG is False
unless --force is passed).
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.notes.models import Category, Note

User = get_user_model()

DEMO_EMAIL = "demo@turbo.ai"
DEMO_PASSWORD = "demo12345"

# Mirrors the sample notes shown in the challenge prototype.
SAMPLE_NOTES = [
    (
        "Random Thoughts",
        "Grocery List",
        "- Milk\n- Eggs\n- Bread\n- Bananas\n- Spinach",
    ),
    (
        "School",
        "Meeting with Team",
        "Discuss project timeline and milestones. Review budget and resource "
        "allocation. Address any blockers and plan next steps.",
    ),
    (
        "Random Thoughts",
        "Vacation Ideas",
        "- Visit Bali for beaches and culture\n- Explore the historic sites in "
        "Rome\n- Go hiking in the Swiss Alps\n- Relax in the hot springs of Iceland",
    ),
    (
        "Personal",
        "Reading List",
        "Lately, I've been on a quest to discover new books to read. I've come "
        'across several recommendations that have piqued my interest: "The '
        'Alchemist" by Paulo Coelho, "Educated" by Tara Westover, and '
        '"Becoming" by Michelle Obama.',
    ),
    (
        "Random Thoughts",
        "A Deep and Contemplative Personal Reflection on the Multifaceted and "
        "Ever-Evolving Journey of Life",
        "Life has been a whirlwind of events and emotions lately. I've been "
        "juggling work, personal projects, and relationships, often feeling like "
        "there aren't enough hours in the day. It's in these moments that I remind "
        "myself of the importance of self-care and mindfulness.",
    ),
    (
        "School",
        "Project X Updates",
        "Finalized design mockups and received approval from stakeholders. Began "
        "development on the front-end. Backend integration is scheduled for next "
        "week. Team is on track to meet the deadline.",
    ),
]


class Command(BaseCommand):
    help = "Create a demo user (demo@turbo.ai) with sample notes for exploring the app."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Run even if DEBUG is False.",
        )
        parser.add_argument(
            "--email",
            default=DEMO_EMAIL,
            help=f"Email for the seeded user (default: {DEMO_EMAIL}).",
        )
        parser.add_argument(
            "--password",
            default=DEMO_PASSWORD,
            help="Password for the seeded user (default: demo12345).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        from django.conf import settings

        if not settings.DEBUG and not options["force"]:
            self.stdout.write(
                self.style.WARNING("Refusing to seed with DEBUG=False. Pass --force to override.")
            )
            return

        email = options["email"].strip().lower()
        password = options["password"]
        user, created = User.objects.get_or_create(username=email, defaults={"email": email})
        user.set_password(password)
        user.save()

        # Refresh demo notes so reruns stay clean.
        Note.objects.filter(owner=user).delete()

        categories = {c.name: c for c in Category.objects.all()}
        for category_name, title, content in SAMPLE_NOTES:
            Note.objects.create(
                owner=user,
                category=categories[category_name],
                title=title,
                content=content,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(SAMPLE_NOTES)} notes for {email} " f"(password: {password})."
            )
        )
