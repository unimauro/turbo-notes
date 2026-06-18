from django.urls import path

from .views import (
    CookieTokenRefreshView,
    EmailTokenObtainPairView,
    LogoutView,
    MeView,
    PasswordResetView,
    RegisterView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/token/", EmailTokenObtainPairView.as_view(), name="auth-token"),
    path("auth/token/refresh/", CookieTokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/password-reset/", PasswordResetView.as_view(), name="auth-password-reset"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
]
