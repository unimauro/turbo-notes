"""Cookie-aware JWT authentication.

The browser SPA sends its access token as an httpOnly cookie (set on login /
refresh); programmatic clients and tests still use the ``Authorization: Bearer``
header. This class accepts EITHER: it prefers a present header (so Bearer keeps
working unchanged), and otherwise falls back to the access cookie.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication

from .cookies import ACCESS_COOKIE


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # A present Authorization header wins (Bearer clients / tests).
        if self.get_header(request) is not None:
            return super().authenticate(request)
        # Otherwise try the httpOnly access cookie.
        raw_token = request.COOKIES.get(ACCESS_COOKIE)
        if not raw_token:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
