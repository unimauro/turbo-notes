import time

import pytest

from apps.notes.models import Note

from .factories import NoteFactory

pytestmark = pytest.mark.django_db


class TestNoteModel:
    def test_str_returns_title(self):
        note = NoteFactory(title="Groceries")
        assert str(note) == "Groceries"

    def test_timestamps_are_set_on_create(self):
        note = NoteFactory()
        assert note.created_at is not None
        assert note.updated_at is not None

    def test_updated_at_changes_on_save(self):
        note = NoteFactory()
        original = note.updated_at
        time.sleep(0.01)
        note.title = "Edited"
        note.save()
        note.refresh_from_db()
        assert note.updated_at > original

    def test_content_may_be_blank(self):
        note = NoteFactory(content="")
        note.full_clean()  # must not raise
        assert note.content == ""

    def test_default_ordering_is_most_recently_updated_first(self):
        first = NoteFactory(title="first")
        time.sleep(0.01)
        second = NoteFactory(title="second")
        time.sleep(0.01)
        first.title = "first (touched)"
        first.save()
        assert list(Note.objects.values_list("id", flat=True)) == [first.id, second.id]
