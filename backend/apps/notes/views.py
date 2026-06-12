from rest_framework import filters, viewsets

from .models import Note
from .serializers import NoteSerializer


class NoteViewSet(viewsets.ModelViewSet):
    """CRUD for notes.

    Supports:
    * ``?search=`` — case-insensitive match on title OR content
    * ``?ordering=`` — updated_at, created_at, title (prefix ``-`` for desc;
      default ``-updated_at`` so the freshest note is always first)
    * ``?page=`` / ``?page_size=`` — page-number pagination (12/page, max 100)
    """

    queryset = Note.objects.all()
    serializer_class = NoteSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "content"]
    ordering_fields = ["updated_at", "created_at", "title"]
    ordering = ["-updated_at"]
