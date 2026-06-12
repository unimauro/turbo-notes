import pytest

from apps.notes.serializers import NoteSerializer

from .factories import NoteFactory

pytestmark = pytest.mark.django_db


class TestNoteSerializer:
    def test_valid_payload(self):
        serializer = NoteSerializer(data={"title": "Hello", "content": "World"})
        assert serializer.is_valid(), serializer.errors
        note = serializer.save()
        assert note.title == "Hello"
        assert note.content == "World"

    def test_content_is_optional(self):
        serializer = NoteSerializer(data={"title": "Only title"})
        assert serializer.is_valid(), serializer.errors
        assert serializer.save().content == ""

    def test_missing_title_is_invalid(self):
        serializer = NoteSerializer(data={"content": "no title"})
        assert not serializer.is_valid()
        assert serializer.errors["title"] == ["Title is required."]

    @pytest.mark.parametrize("bad_title", ["", "   "])
    def test_blank_or_whitespace_title_is_invalid(self, bad_title):
        serializer = NoteSerializer(data={"title": bad_title, "content": "x"})
        assert not serializer.is_valid()
        assert serializer.errors["title"] == ["Title cannot be blank."]

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
        assert set(data) == {"id", "title", "content", "created_at", "updated_at"}
