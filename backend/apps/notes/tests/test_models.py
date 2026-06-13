import time

import pytest
from django.db.models import ProtectedError

from apps.notes.models import Category, Note, get_default_category

from .factories import NoteFactory, UserFactory

pytestmark = pytest.mark.django_db


class TestCategoryModel:
    def test_seed_data_exists_in_order(self):
        assert list(Category.objects.values_list("name", "color")) == [
            ("Random Thoughts", "coral"),
            ("School", "yellow"),
            ("Personal", "teal"),
            ("Drama", "lavender"),
        ]

    def test_str_returns_name(self):
        assert str(Category.objects.first()) == "Random Thoughts"

    def test_get_default_category_is_random_thoughts(self):
        assert get_default_category().name == "Random Thoughts"

    def test_category_with_notes_is_protected_from_delete(self):
        note = NoteFactory()
        with pytest.raises(ProtectedError):
            note.category.delete()


class TestNoteModel:
    def test_str_returns_title(self):
        note = NoteFactory(title="Groceries")
        assert str(note) == "Groceries"

    def test_str_for_untitled_note(self):
        note = NoteFactory(title="")
        assert str(note) == f"Untitled note #{note.pk}"

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

    def test_title_and_content_may_be_blank(self):
        note = NoteFactory(title="", content="")
        note.full_clean()  # must not raise
        assert note.title == ""
        assert note.content == ""

    def test_default_ordering_is_most_recently_updated_first(self):
        first = NoteFactory(title="first")
        time.sleep(0.01)
        second = NoteFactory(title="second")
        time.sleep(0.01)
        first.title = "first (touched)"
        first.save()
        assert list(Note.objects.values_list("id", flat=True)) == [first.id, second.id]

    def test_deleting_owner_cascades_to_notes(self):
        note = NoteFactory()
        note.owner.delete()
        assert not Note.objects.filter(id=note.id).exists()

    def test_owner_reverse_accessor(self):
        user = UserFactory()
        NoteFactory.create_batch(2, owner=user)
        assert user.notes.count() == 2
