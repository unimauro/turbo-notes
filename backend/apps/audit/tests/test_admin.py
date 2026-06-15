"""Audit models are registered in the admin and are read-only (no add/change)."""

import pytest
from django.contrib import admin

from apps.audit.models import AiUsageEvent, AuthEvent

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("model", [AuthEvent, AiUsageEvent])
def test_model_is_registered(model):
    assert model in admin.site._registry


@pytest.mark.parametrize("model", [AuthEvent, AiUsageEvent])
def test_admin_is_read_only(model):
    model_admin = admin.site._registry[model]
    assert model_admin.has_add_permission(request=None) is False
    assert model_admin.has_change_permission(request=None) is False
    assert model_admin.has_delete_permission(request=None) is False
    # Every field is read-only.
    readonly = model_admin.get_readonly_fields(request=None)
    assert set(readonly) == {f.name for f in model._meta.fields}
