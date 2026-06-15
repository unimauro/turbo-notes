"""Back-office admin for the (default) User model.

A lightweight registration showing the identity essentials is enough; the
project keeps Django's default User (email stored as username).
"""

from django.contrib import admin
from django.contrib.auth import get_user_model

User = get_user_model()

# Django's auth app auto-registers User with its own UserAdmin; replace it with
# a lightweight, project-specific listing (email-as-username identity).
admin.site.unregister(User)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "username", "last_login", "is_staff")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "username")
    ordering = ("-date_joined",)
