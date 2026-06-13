"""Auth serializers: email-based registration and JWT token obtain.

Design decision: we keep Django's default ``User`` model and store the email
in **both** ``username`` and ``email``. A custom user model would be cleaner
greenfield, but swapping ``AUTH_USER_MODEL`` mid-project (existing migrations)
is exactly the kind of churn the challenge scope doesn't justify. The
email-as-username invariant is enforced in one place: ``RegisterSerializer``.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

# Default User.username is limited to 150 chars; mirror that on the email.
EMAIL_MAX_LENGTH = 150


class RegisterSerializer(serializers.Serializer):
    """Creates a user from ``{email, password}``; responds ``{id, email}``."""

    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(max_length=EMAIL_MAX_LENGTH)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value: str) -> str:
        # Lowercase to avoid Foo@x.com / foo@x.com duplicate accounts.
        value = value.lower()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_password(self, value: str) -> str:
        validate_password(value)  # raises DRF-compatible ValidationError
        return value

    def create(self, validated_data: dict) -> User:
        email = validated_data["email"]
        return User.objects.create_user(
            username=email, email=email, password=validated_data["password"]
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """simplejwt's pair serializer, but the credential field is ``email``.

    Registration stores the email as the username, so we just rename the
    input field and hand the value to the standard ``ModelBackend`` flow.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # A fresh field (not the popped one): rebinding a bound field keeps
        # its old source="username", which would route the value wrongly.
        del self.fields[self.username_field]
        self.fields["email"] = serializers.EmailField(write_only=True)

    def validate(self, attrs: dict) -> dict:
        attrs[self.username_field] = attrs.pop("email").lower()
        return super().validate(attrs)
