"""Back-office admin for notes and the seeded category palette."""

from django.contrib import admin

from .models import Category, Note


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "color")
    list_filter = ("color",)
    search_fields = ("name",)


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "category", "updated_at")
    list_filter = ("category", "updated_at")
    search_fields = ("title", "content", "owner__email", "owner__username")
    date_hierarchy = "updated_at"
    raw_id_fields = ("owner",)
