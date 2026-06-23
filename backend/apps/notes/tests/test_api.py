import time

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.notes.models import Category, Note

from .factories import NoteFactory, UserFactory

pytestmark = pytest.mark.django_db

LIST_URL = reverse("note-list")
CATEGORIES_URL = reverse("category-list")


def detail_url(pk: int) -> str:
    return reverse("note-detail", args=[pk])


@pytest.fixture
def user():
    return UserFactory()


@pytest.fixture
def client(user) -> APIClient:
    """API client authenticated as ``user`` (JWT enforced in separate tests)."""
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def anon_client() -> APIClient:
    return APIClient()


class TestHealth:
    def test_health_returns_ok_without_auth(self, anon_client):
        response = anon_client.get("/api/health")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"status": "ok"}


class TestSchema:
    def test_openapi_schema_is_served_without_auth(self, anon_client):
        response = anon_client.get("/api/schema")
        assert response.status_code == status.HTTP_200_OK


class TestAuthRequired:
    @pytest.mark.parametrize(
        "method,url",
        [
            ("get", LIST_URL),
            ("post", LIST_URL),
            ("get", CATEGORIES_URL),
            ("get", detail_url(1)),
            ("patch", detail_url(1)),
            ("delete", detail_url(1)),
        ],
    )
    def test_unauthenticated_requests_return_401(self, anon_client, method, url):
        response = getattr(anon_client, method)(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestNoteCrud:
    def test_create_note(self, client, user):
        payload = {"title": "My note", "content": "Some content"}
        response = client.post(LIST_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["title"] == "My note"
        assert body["content"] == "Some content"
        assert body["category"]["name"] == "Random Thoughts"  # default category
        note = Note.objects.get(id=body["id"])
        assert note.owner == user

    def test_create_note_with_blank_title_is_allowed(self, client):
        # The editor autosaves drafts before the user types a title.
        response = client.post(LIST_URL, {"title": "", "content": "draft"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["title"] == ""

    def test_create_note_without_title_is_allowed(self, client):
        response = client.post(LIST_URL, {"content": "draft"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["title"] == ""

    def test_create_note_with_category_id(self, client):
        school = Category.objects.get(name="School")
        response = client.post(
            LIST_URL, {"title": "Homework", "category_id": school.id}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["category"] == {
            "id": school.id,
            "name": "School",
            "color": "yellow",
        }

    def test_create_note_with_unknown_category_returns_400(self, client):
        response = client.post(LIST_URL, {"title": "x", "category_id": 999_999}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "category_id" in response.json()

    def test_retrieve_note(self, client, user):
        note = NoteFactory(owner=user)
        response = client.get(detail_url(note.id))
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert body["id"] == note.id
        assert set(body) == {"id", "title", "content", "category", "created_at", "updated_at"}

    def test_retrieve_missing_note_returns_404(self, client):
        response = client.get(detail_url(999_999))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_full_update_note(self, client, user):
        note = NoteFactory(owner=user, title="old", content="old")
        response = client.put(
            detail_url(note.id), {"title": "new", "content": "new"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        note.refresh_from_db()
        assert note.title == "new"
        assert note.content == "new"

    def test_partial_update_note(self, client, user):
        note = NoteFactory(owner=user, title="old", content="keep me")
        response = client.patch(detail_url(note.id), {"title": "patched"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        note.refresh_from_db()
        assert note.title == "patched"
        assert note.content == "keep me"

    def test_update_category_via_patch(self, client, user):
        note = NoteFactory(owner=user)
        drama = Category.objects.get(name="Drama")
        response = client.patch(detail_url(note.id), {"category_id": drama.id}, format="json")
        assert response.status_code == status.HTTP_200_OK
        note.refresh_from_db()
        assert note.category == drama

    def test_delete_note(self, client, user):
        note = NoteFactory(owner=user)
        response = client.delete(detail_url(note.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Note.objects.filter(id=note.id).exists()

    def test_delete_missing_note_returns_404(self, client):
        response = client.delete(detail_url(999_999))
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestPerUserScoping:
    """User A must never see, edit, or delete user B's notes (all 404)."""

    def test_list_only_returns_own_notes(self, client, user):
        mine = NoteFactory(owner=user)
        NoteFactory()  # someone else's
        response = client.get(LIST_URL)
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["id"] == mine.id

    @pytest.mark.parametrize("method", ["get", "patch", "delete"])
    def test_other_users_note_is_404(self, client, method):
        other_note = NoteFactory()  # owned by a different user
        response = getattr(client, method)(
            detail_url(other_note.id), {"title": "hijack"}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        other_note.refresh_from_db()
        assert other_note.title != "hijack"
        assert Note.objects.filter(id=other_note.id).exists()


class TestCategoryEndpoint:
    def test_lists_all_categories_unpaginated(self, client):
        response = client.get(CATEGORIES_URL)
        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert isinstance(body, list)  # no pagination envelope
        assert [c["name"] for c in body] == ["Random Thoughts", "School", "Personal", "Drama"]
        assert [c["color"] for c in body] == ["coral", "yellow", "teal", "lavender"]

    def test_note_count_is_scoped_to_requesting_user(self, client, user):
        school = Category.objects.get(name="School")
        NoteFactory.create_batch(2, owner=user)  # default category
        NoteFactory(owner=user, category=school)
        NoteFactory.create_batch(5)  # other users' notes must not count
        response = client.get(CATEGORIES_URL)
        counts = {c["name"]: c["note_count"] for c in response.json()}
        assert counts == {"Random Thoughts": 2, "School": 1, "Personal": 0, "Drama": 0}


class TestPerUserCategories:
    """User-created categories are private — visible only to their creator —
    while the seeded categories (owner=NULL) stay global to everyone."""

    def _client_for(self, u) -> APIClient:
        c = APIClient()
        c.force_authenticate(user=u)
        return c

    def test_create_category_sets_owner_and_returns_it(self, client, user):
        response = client.post(CATEGORIES_URL, {"name": "Work", "color": "teal"}, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["name"] == "Work" and body["color"] == "teal"
        assert Category.objects.get(pk=body["id"]).owner == user

    def test_created_category_is_visible_to_its_creator(self, client):
        client.post(CATEGORIES_URL, {"name": "Work", "color": "teal"}, format="json")
        names = [c["name"] for c in client.get(CATEGORIES_URL).json()]
        assert "Work" in names

    def test_private_category_is_invisible_to_other_users(self, client):
        # User A creates a private category...
        client.post(CATEGORIES_URL, {"name": "Secret", "color": "coral"}, format="json")
        # ...user B must NOT see it, but still sees the global seeds.
        other = self._client_for(UserFactory())
        names = [c["name"] for c in other.get(CATEGORIES_URL).json()]
        assert "Secret" not in names
        assert "Random Thoughts" in names

    def test_invalid_color_returns_400(self, client):
        response = client.post(CATEGORIES_URL, {"name": "Bad", "color": "magenta"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "color" in response.json()

    def test_duplicate_name_for_same_user_returns_400(self, client):
        client.post(CATEGORIES_URL, {"name": "Work", "color": "teal"}, format="json")
        dup = client.post(CATEGORIES_URL, {"name": "work", "color": "coral"}, format="json")
        assert dup.status_code == status.HTTP_400_BAD_REQUEST
        assert "name" in dup.json()

    def test_two_users_can_reuse_the_same_name(self, client):
        client.post(CATEGORIES_URL, {"name": "Work", "color": "teal"}, format="json")
        other = self._client_for(UserFactory())
        ok = other.post(CATEGORIES_URL, {"name": "Work", "color": "coral"}, format="json")
        assert ok.status_code == status.HTTP_201_CREATED

    def test_cannot_assign_another_users_category_to_a_note(self, client):
        foreign = Category.objects.create(name="Theirs", color="teal", owner=UserFactory())
        response = client.post(LIST_URL, {"title": "x", "category_id": foreign.id}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "category_id" in response.json()


class TestCategoryFilter:
    def test_filter_notes_by_category(self, client, user):
        school = Category.objects.get(name="School")
        in_school = NoteFactory(owner=user, category=school)
        NoteFactory(owner=user)  # Random Thoughts
        response = client.get(LIST_URL, {"category": school.id})
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["id"] == in_school.id

    def test_non_numeric_category_param_is_ignored(self, client, user):
        NoteFactory.create_batch(2, owner=user)
        response = client.get(LIST_URL, {"category": "not-a-number"})
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["count"] == 2


class TestPagination:
    def test_default_page_size_is_12(self, client, user):
        NoteFactory.create_batch(15, owner=user)
        response = client.get(LIST_URL)
        body = response.json()
        assert body["count"] == 15
        assert len(body["results"]) == 12
        assert body["next"] is not None
        assert body["previous"] is None

    def test_second_page_has_remainder(self, client, user):
        NoteFactory.create_batch(15, owner=user)
        response = client.get(LIST_URL, {"page": 2})
        body = response.json()
        assert len(body["results"]) == 3
        assert body["next"] is None
        assert body["previous"] is not None

    def test_page_size_query_param(self, client, user):
        NoteFactory.create_batch(6, owner=user)
        response = client.get(LIST_URL, {"page_size": 5})
        assert len(response.json()["results"]) == 5

    def test_page_size_is_capped_at_100(self, client, user):
        NoteFactory.create_batch(101, owner=user)
        response = client.get(LIST_URL, {"page_size": 1000})
        assert len(response.json()["results"]) == 100

    def test_out_of_range_page_returns_404(self, client, user):
        NoteFactory.create_batch(3, owner=user)
        response = client.get(LIST_URL, {"page": 99})
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestSearch:
    def test_search_matches_title(self, client, user):
        NoteFactory(owner=user, title="Quarterly report", content="numbers")
        NoteFactory(owner=user, title="Groceries", content="milk")
        response = client.get(LIST_URL, {"search": "quarterly"})
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["title"] == "Quarterly report"

    def test_search_matches_content(self, client, user):
        NoteFactory(owner=user, title="Untitled", content="remember the milk")
        NoteFactory(owner=user, title="Other", content="nothing here")
        response = client.get(LIST_URL, {"search": "milk"})
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["content"] == "remember the milk"

    def test_search_no_match_returns_empty(self, client, user):
        NoteFactory(owner=user, title="A", content="B")
        response = client.get(LIST_URL, {"search": "zzz-no-match"})
        assert response.json()["count"] == 0


class TestOrdering:
    def test_default_ordering_is_minus_updated_at(self, client, user):
        older = NoteFactory(owner=user, title="older")
        time.sleep(0.01)
        newer = NoteFactory(owner=user, title="newer")
        time.sleep(0.01)
        older.title = "older (touched)"
        older.save()
        response = client.get(LIST_URL)
        ids = [item["id"] for item in response.json()["results"]]
        assert ids == [older.id, newer.id]

    def test_ordering_by_title(self, client, user):
        NoteFactory(owner=user, title="banana")
        NoteFactory(owner=user, title="apple")
        response = client.get(LIST_URL, {"ordering": "title"})
        titles = [item["title"] for item in response.json()["results"]]
        assert titles == ["apple", "banana"]

    def test_ordering_by_created_at_desc(self, client, user):
        first = NoteFactory(owner=user)
        time.sleep(0.01)
        second = NoteFactory(owner=user)
        response = client.get(LIST_URL, {"ordering": "-created_at"})
        ids = [item["id"] for item in response.json()["results"]]
        assert ids == [second.id, first.id]
