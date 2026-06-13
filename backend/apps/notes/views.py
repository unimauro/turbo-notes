from django.db.models import Count, Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, generics, viewsets

from .models import Category, Note
from .serializers import CategorySerializer, NoteSerializer


@extend_schema(
    parameters=[
        OpenApiParameter("category", OpenApiTypes.INT, description="Filter notes by category id.")
    ]
)
class NoteViewSet(viewsets.ModelViewSet):
    """CRUD for the authenticated user's notes (and only theirs).

    Scoping happens in ``get_queryset``, so other users' notes 404 on every
    action — indistinguishable from nonexistent, which avoids leaking ids.

    Supports:
    * ``?category=<id>`` — filter by category
    * ``?search=`` — case-insensitive match on title OR content
    * ``?ordering=`` — updated_at, created_at, title (default ``-updated_at``)
    * ``?page=`` / ``?page_size=`` — page-number pagination (12/page, max 100)
    """

    serializer_class = NoteSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "content"]
    ordering_fields = ["updated_at", "created_at", "title"]
    ordering = ["-updated_at"]

    def get_queryset(self):
        queryset = Note.objects.filter(owner=self.request.user).select_related("category")
        category = self.request.query_params.get("category")
        if category and category.isdigit():
            queryset = queryset.filter(category_id=category)
        return queryset

    def perform_create(self, serializer: NoteSerializer) -> None:
        serializer.save(owner=self.request.user)


class CategoryListView(generics.ListAPIView):
    """All categories with the *requesting user's* note count.

    Always 4 rows (seed data), so pagination is disabled — the frontend
    sidebar consumes a plain array.
    """

    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        return Category.objects.annotate(
            note_count=Count("notes", filter=Q(notes__owner=self.request.user))
        )
