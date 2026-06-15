"""
Django settings for the Turbo Notes backend.

Configuration is read from the environment (12-factor) with safe local-dev
defaults, so `./manage.py runserver` works out of the box while Docker/CI
override via env vars:

- DATABASE_URL          -> dj-database-url (default: local sqlite file)
- DJANGO_SECRET_KEY     -> dev default only; MUST be set in production
- DJANGO_DEBUG          -> "true"/"false" (default: true for local dev)
- CORS_ALLOWED_ORIGINS  -> comma-separated list of origins
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


# --- Core -------------------------------------------------------------------

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "dev-only-insecure-secret-key-change-me",  # noqa: S105 - dev fallback only
)

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "*")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "drf_spectacular",
    # Local
    "apps.users",
    "apps.notes",
    "apps.transcription",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---------------------------------------------------------------

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- I18N / static ----------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- DRF / API --------------------------------------------------------------

REST_FRAMEWORK = {
    # JWT everywhere by default; the only AllowAny views are register/token
    # (declared per-view) and /api/health (a plain Django view, not DRF).
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "apps.notes.pagination.DefaultPagination",
    "PAGE_SIZE": 12,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"]
    + (["rest_framework.renderers.BrowsableAPIRenderer"] if DEBUG else []),
    # Scoped throttling only: applied per-view via throttle_scope so unrelated
    # endpoints (and tests) are unaffected. "auth" slows login/register
    # brute-force (keyed by IP for anonymous); "ai" caps the cost-incurring
    # OpenAI transcribe/speak endpoints (keyed by user once authenticated).
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
        "ai": "20/min",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Turbo Notes API",
    "DESCRIPTION": "Notes-taking API for the Turbo AI engineering challenge.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- Auth -------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# --- CORS -------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")

# --- AI transcription (Whisper) ---------------------------------------------
# OpenAI-compatible audio transcription. Works with OpenAI or any compatible
# endpoint (e.g. Groq: OPENAI_BASE_URL=https://api.groq.com/openai/v1 with
# WHISPER_MODEL=whisper-large-v3). When OPENAI_API_KEY is unset the feature is
# disabled and the frontend falls back to free in-browser Web Speech dictation.

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "whisper-1").strip()

# True only when an API key is configured; gates the /transcribe/ endpoint.
TRANSCRIPTION_ENABLED = bool(OPENAI_API_KEY)

# Reject uploads larger than this (matches OpenAI's 25MB Whisper limit).
TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024

# --- AI text-to-speech ("read note aloud") ----------------------------------
# Reuses OPENAI_API_KEY / OPENAI_BASE_URL above. When no key is configured the
# /speak/ endpoint is disabled and the frontend falls back to the browser's
# free Web Speech synthesis (with a better-chosen voice).
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "tts-1").strip()
# Warm/natural female voice. Valid: alloy, echo, fable, onyx, nova, shimmer.
OPENAI_TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "nova").strip()

# True only when an API key is configured; gates the /speak/ endpoint.
TTS_ENABLED = bool(OPENAI_API_KEY)

# Reject TTS requests longer than this (keeps responses fast/cheap).
TTS_MAX_CHARS = 4000

# --- Production security hardening -------------------------------------------
# Only applied when DEBUG is False so local development and the test suite
# (which run with DEBUG=True) are untouched. The app runs behind Caddy, which
# terminates TLS and already redirects http->https, so SECURE_SSL_REDIRECT is
# intentionally left off (Caddy handles it; enabling here risks double-redirect).
if not DEBUG:
    # Trust the X-Forwarded-Proto header set by the Caddy TLS terminator.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

    # HSTS: force HTTPS for a year, including subdomains, and allow preload.
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    # Only send cookies over HTTPS.
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    # Defense-in-depth header (default True, set explicitly for clarity).
    SECURE_CONTENT_TYPE_NOSNIFF = True
