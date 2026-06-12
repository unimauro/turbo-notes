from django.db import models


class Note(models.Model):
    """A single note: a required title plus optional free-form content.

    Scope decisions (conscious, for the challenge):

    * **No owner / auth FK** — the challenge does not ask for authentication,
      so notes are global. Adding a ``user`` FK later is a single migration;
      building auth now would be overengineering for the brief.
    * **Plain BigAutoField PK, not UUID** — sequential ids are fine for a
      single-tenant API with no auth (nothing to enumerate that isn't already
      public via the list endpoint), they index/paginate better, and they keep
      URLs human-friendly. Swapping to UUIDs is trivial if multi-tenancy ever
      lands.
    * ``updated_at`` is indexed because it backs the default ordering of the
      list endpoint (``-updated_at``) on every page load.
    """

    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.title
