from django.db.models import Q
from rest_framework import serializers

from .models import Category, Note, get_default_category


class CategorySerializer(serializers.ModelSerializer):
    """Category with the requesting user's note count (annotated in the view)."""

    note_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "color", "note_count"]


class CategoryCreateSerializer(serializers.ModelSerializer):
    """Create a private (per-user) category. ``owner`` is injected by the view.

    Color is validated against the palette by the model choices. The name dup
    check is done here (not via the DB constraint) so a repeat returns a clean
    400 instead of a 500 IntegrityError — same pattern as duplicate-email on
    registration.
    """

    class Meta:
        model = Category
        fields = ["id", "name", "color"]

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be blank.")
        owner = self.context["request"].user
        if Category.objects.filter(owner=owner, name__iexact=value).exists():
            raise serializers.ValidationError("You already have a category with this name.")
        return value


class NoteCategorySerializer(serializers.ModelSerializer):
    """Compact nested representation embedded in every note."""

    class Meta:
        model = Category
        fields = ["id", "name", "color"]


class NoteSerializer(serializers.ModelSerializer):
    """Note CRUD: nested ``category`` on read, ``category_id`` on write.

    ``title`` is optional/blank because the editor autosaves drafts before a
    title exists. ``owner`` never crosses the API surface — the view injects
    it from ``request.user``.
    """

    title = serializers.CharField(
        max_length=255, allow_blank=True, required=False, default="", trim_whitespace=True
    )
    category = NoteCategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source="category",
        write_only=True,
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Scope assignable categories to the visible set (global + own), so a
        # user can't attach another user's private category to a note — an
        # unknown/foreign id then fails validation (400) instead of leaking.
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            self.fields["category_id"].queryset = Category.objects.filter(
                Q(owner__isnull=True) | Q(owner=request.user)
            )

    class Meta:
        model = Note
        fields = ["id", "title", "content", "category", "category_id", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data: dict) -> Note:
        validated_data.setdefault("category", get_default_category())
        return super().create(validated_data)
