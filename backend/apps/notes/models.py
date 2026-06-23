from django.conf import settings
from django.db import models

DEFAULT_CATEGORY_NAME = "Random Thoughts"


class Category(models.Model):
    """A fixed, seeded palette of note categories (see migration 0002).

    ``color`` stores a palette *slug* — the frontend owns the actual hex
    values, so a design retune never needs a backend deploy or migration.
    """

    class Color(models.TextChoices):
        CORAL = "coral"
        YELLOW = "yellow"
        TEAL = "teal"
        LAVENDER = "lavender"

    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, choices=Color.choices)
    # null owner => a global, seeded category everyone sees.
    # set owner  => a private, user-created category visible ONLY to its creator.
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="categories",
    )

    class Meta:
        ordering = ["id"]  # seed order == display order (sidebar/dropdown)
        verbose_name_plural = "categories"
        constraints = [
            # A user can't have two categories with the same name. Globals have
            # owner=NULL; Postgres treats NULLs as distinct and the seed names
            # are unique, so the global rows are unaffected.
            models.UniqueConstraint(fields=["owner", "name"], name="uniq_category_owner_name"),
        ]

    def __str__(self) -> str:
        return self.name


def get_default_category() -> Category:
    """Default for notes created without an explicit category.

    Resolved lazily (serializer-time), never as a model/migration default,
    so the schema migrations stay decoupled from seed data.
    """
    return Category.objects.get(name=DEFAULT_CATEGORY_NAME)


class Note(models.Model):
    """A user's note: optional title/content, always categorized and owned.

    Decisions:

    * ``owner`` CASCADE — notes are meaningless without their author.
    * ``category`` PROTECT — categories are seed data; deleting one with
      notes attached should be a loud error, not silent data loss.
    * ``title`` may be blank: the editor autosaves drafts before a title is
      typed (the UI shows a placeholder for untitled notes).
    * Plain BigAutoField PK — ids are only reachable through the owner-scoped
      queryset, so enumeration leaks nothing; sequential ids index better.
    * ``updated_at`` indexed: backs the default ``-updated_at`` ordering.
    """

    title = models.CharField(max_length=255, blank=True, default="")
    content = models.TextField(blank=True, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes"
    )
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="notes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.title or f"Untitled note #{self.pk}"
