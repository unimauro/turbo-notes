from rest_framework import serializers

from .models import Category, Note, get_default_category


class CategorySerializer(serializers.ModelSerializer):
    """Category with the requesting user's note count (annotated in the view)."""

    note_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "color", "note_count"]


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

    class Meta:
        model = Note
        fields = ["id", "title", "content", "category", "category_id", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data: dict) -> Note:
        validated_data.setdefault("category", get_default_category())
        return super().create(validated_data)
