from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import EmailTokenObtainPairSerializer, RegisterSerializer


@extend_schema(tags=["auth"])
class RegisterView(generics.CreateAPIView):
    """POST {email, password} -> 201 {id, email}."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # credentials-in, no token required


@extend_schema(tags=["auth"])
class EmailTokenObtainPairView(TokenObtainPairView):
    """POST {email, password} -> 200 {access, refresh}."""

    serializer_class = EmailTokenObtainPairSerializer
