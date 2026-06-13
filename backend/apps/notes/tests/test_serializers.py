import pytest

from apps.notes.models import Category
from apps.notes.serializers import CategorySerializer, NoteSerializer

from .factories import NoteFactory, UserFactory

pytestmark = pytest.mark.django_db


class TestNoteSerializer:
    def test_valid_payload(self):
        serializer = NoteSerializer(data={"title": "Hello", "content": "World"})
        assert serializer.is_valid(), serializer.errors
        note = serializer.save(owner=UserFactory())
        assert note.title == "Hello"
        assert note.content == "World"

    def test_content_is_optional(self):
        serializer = NoteSerializer(data={"title": "Only title"})
        assert serializer.is_valid(), serializer.errors
        assert serializer.save(owner=UserFactory()).content == ""

    def test_blank_and_missing_title_are_allowed(self):
        # The editor autosaves drafts before a title exists.
        for payload in ({"content": "draft"}, {"title": "", "content": "draft"}):
            serializer = NoteSerializer(data=payload)
            assert serializer.is_valid(), serializer.errors
            assert serializer.save(owner=UserFactory()).title == ""

    def test_default_category_is_random_thoughts(self):
        serializer = NoteSerializer(data={"title": "No category sent"})
        assert serializer.is_valid(), serializer.errors
        assert serializer.save(owner=UserFactory()).category.name == "Random Thoughts"

    def test_category_id_write_sets_category(self):
        school = Category.objects.get(name="School")
        serializer = NoteSerializer(data={"title": "Homework", "category_id": school.id})
        assert serializer.is_valid(), serializer.errors
        assert serializer.save(owner=UserFactory()).category == school

    def test_unknown_category_id_is_invalid(self):
        serializer = NoteSerializer(data={"title": "x", "category_id": 999_999})
        assert not serializer.is_valid()
        assert "category_id" in serializer.errors

    def test_title_longer_than_255_is_invalid(self):
        serializer = NoteSerializer(data={"title": "x" * 256})
        assert not serializer.is_valid()
        assert "title" in serializer.errors

    def test_title_is_trimmed(self):
        serializer = NoteSerializer(data={"title": "  padded  "})
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["title"] == "padded"

    def test_read_only_fields_are_ignored_on_input(self):
        note = NoteFactory()
        serializer = NoteSerializer(
            note, data={"title": "new", "id": 999, "created_at": "2000-01-01T00:00:00Z"}
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.id == note.id
        assert updated.created_at == note.created_at

    def test_serialized_output_shape(self):
        note = NoteFactory()
        data = NoteSerializer(note).data
        assert set(data) == {"id", "title", "content", "category", "created_at", "updated_at"}
        assert set(data["category"]) == {"id", "name", "color"}


class TestCategorySerializer:
    def test_output_shape_includes_note_count(self):
        category = Category.objects.first()
        category.note_count = 3  # normally annotated by the view
        data = CategorySerializer(category).data
        assert data == {
            "id": category.id,
            "name": "Random Thoughts",
            "color": "coral",
            "note_count": 3,
        }
