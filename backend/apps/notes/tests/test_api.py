import time

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.notes.models import Note

from .factories import NoteFactory

pytestmark = pytest.mark.django_db

LIST_URL = reverse("note-list")


def detail_url(pk: int) -> str:
    return reverse("note-detail", args=[pk])


@pytest.fixture
def client() -> APIClient:
    return APIClient()


class TestHealth:
    def test_health_returns_ok(self, client):
        response = client.get("/api/health")
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"status": "ok"}


class TestSchema:
    def test_openapi_schema_is_served(self, client):
        response = client.get("/api/schema")
        assert response.status_code == status.HTTP_200_OK


class TestNoteCrud:
    def test_create_note(self, client):
        payload = {"title": "My note", "content": "Some content"}
        response = client.post(LIST_URL, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        body = response.json()
        assert body["title"] == "My note"
        assert body["content"] == "Some content"
        assert Note.objects.count() == 1

    def test_create_note_with_blank_title_returns_400(self, client):
        response = client.post(LIST_URL, {"title": "", "content": "x"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["title"] == ["Title cannot be blank."]

    def test_create_note_without_title_returns_400(self, client):
        response = client.post(LIST_URL, {"content": "x"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["title"] == ["Title is required."]

    def test_retrieve_note(self, client):
        note = NoteFactory()
        response = client.get(detail_url(note.id))
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == note.id

    def test_retrieve_missing_note_returns_404(self, client):
        response = client.get(detail_url(999_999))
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_full_update_note(self, client):
        note = NoteFactory(title="old", content="old")
        response = client.put(
            detail_url(note.id), {"title": "new", "content": "new"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        note.refresh_from_db()
        assert note.title == "new"
        assert note.content == "new"

    def test_partial_update_note(self, client):
        note = NoteFactory(title="old", content="keep me")
        response = client.patch(detail_url(note.id), {"title": "patched"}, format="json")
        assert response.status_code == status.HTTP_200_OK
        note.refresh_from_db()
        assert note.title == "patched"
        assert note.content == "keep me"

    def test_update_with_blank_title_returns_400(self, client):
        note = NoteFactory()
        response = client.patch(detail_url(note.id), {"title": "   "}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_note(self, client):
        note = NoteFactory()
        response = client.delete(detail_url(note.id))
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Note.objects.filter(id=note.id).exists()

    def test_delete_missing_note_returns_404(self, client):
        response = client.delete(detail_url(999_999))
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestPagination:
    def test_default_page_size_is_12(self, client):
        NoteFactory.create_batch(15)
        response = client.get(LIST_URL)
        body = response.json()
        assert body["count"] == 15
        assert len(body["results"]) == 12
        assert body["next"] is not None
        assert body["previous"] is None

    def test_second_page_has_remainder(self, client):
        NoteFactory.create_batch(15)
        response = client.get(LIST_URL, {"page": 2})
        body = response.json()
        assert len(body["results"]) == 3
        assert body["next"] is None
        assert body["previous"] is not None

    def test_page_size_query_param(self, client):
        NoteFactory.create_batch(6)
        response = client.get(LIST_URL, {"page_size": 5})
        assert len(response.json()["results"]) == 5

    def test_page_size_is_capped_at_100(self, client):
        NoteFactory.create_batch(101)
        response = client.get(LIST_URL, {"page_size": 1000})
        assert len(response.json()["results"]) == 100

    def test_out_of_range_page_returns_404(self, client):
        NoteFactory.create_batch(3)
        response = client.get(LIST_URL, {"page": 99})
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestSearch:
    def test_search_matches_title(self, client):
        NoteFactory(title="Quarterly report", content="numbers")
        NoteFactory(title="Groceries", content="milk")
        response = client.get(LIST_URL, {"search": "quarterly"})
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["title"] == "Quarterly report"

    def test_search_matches_content(self, client):
        NoteFactory(title="Untitled", content="remember the milk")
        NoteFactory(title="Other", content="nothing here")
        response = client.get(LIST_URL, {"search": "milk"})
        body = response.json()
        assert body["count"] == 1
        assert body["results"][0]["content"] == "remember the milk"

    def test_search_no_match_returns_empty(self, client):
        NoteFactory(title="A", content="B")
        response = client.get(LIST_URL, {"search": "zzz-no-match"})
        assert response.json()["count"] == 0


class TestOrdering:
    def test_default_ordering_is_minus_updated_at(self, client):
        older = NoteFactory(title="older")
        time.sleep(0.01)
        newer = NoteFactory(title="newer")
        time.sleep(0.01)
        older.title = "older (touched)"
        older.save()
        response = client.get(LIST_URL)
        ids = [item["id"] for item in response.json()["results"]]
        assert ids == [older.id, newer.id]

    def test_ordering_by_title(self, client):
        NoteFactory(title="banana")
        NoteFactory(title="apple")
        response = client.get(LIST_URL, {"ordering": "title"})
        titles = [item["title"] for item in response.json()["results"]]
        assert titles == ["apple", "banana"]

    def test_ordering_by_created_at_desc(self, client):
        first = NoteFactory()
        time.sleep(0.01)
        second = NoteFactory()
        response = client.get(LIST_URL, {"ordering": "-created_at"})
        ids = [item["id"] for item in response.json()["results"]]
        assert ids == [second.id, first.id]
