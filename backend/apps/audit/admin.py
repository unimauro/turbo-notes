"""Read-only back-office views for the audit models.

Both models are append-only audit logs, so the admin disallows add/change/
delete — operators inspect and filter, but never mutate, the trail.
"""

from django.contrib import admin

from .models import AiUsageEvent, AuthEvent


class _ReadOnlyAdmin(admin.ModelAdmin):
    """Inspect-only admin: no add/change/delete, every field read-only."""

    def get_readonly_fields(self, request, obj=None):
        return [field.name for field in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuthEvent)
class AuthEventAdmin(_ReadOnlyAdmin):
    list_display = ("event_type", "email", "ip", "created_at")
    list_filter = ("event_type", "created_at")
    search_fields = ("email", "ip")
    date_hierarchy = "created_at"


@admin.register(AiUsageEvent)
class AiUsageEventAdmin(_ReadOnlyAdmin):
    list_display = ("endpoint", "user", "model", "input_size", "success", "created_at")
    list_filter = ("endpoint", "success", "created_at")
    search_fields = ("model",)
    date_hierarchy = "created_at"
