from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CategoryListView, NoteViewSet

router = DefaultRouter()
router.register("notes", NoteViewSet, basename="note")

urlpatterns = [
    path("categories/", CategoryListView.as_view(), name="category-list"),
    *router.urls,
]
