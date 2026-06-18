from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    EmailTokenObtainPairView,
    MeView,
    PasswordResetView,
    RegisterView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/token/", EmailTokenObtainPairView.as_view(), name="auth-token"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/password-reset/", PasswordResetView.as_view(), name="auth-password-reset"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
]
