"""Root URL configuration: versioned API, schema/docs, and health check."""

from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    """Liveness probe. Deliberately avoids any DB hit so it stays cheap."""
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("api/v1/", include("apps.notes.urls")),
    path("api/health", health, name="health"),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
