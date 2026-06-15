"""Shared pytest fixtures for the backend test suite."""

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Reset the cache before every test.

    DRF throttling counters live in Django's cache. Without clearing it per
    test, throttle state would leak across the suite and intermittently push
    unrelated tests past their rate limits. Clearing here keeps every test
    isolated and the suite deterministically green.
    """
    cache.clear()
    yield
