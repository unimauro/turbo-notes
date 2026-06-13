import factory
from django.contrib.auth import get_user_model

from apps.notes.models import Note, get_default_category

User = get_user_model()

TEST_PASSWORD = "str0ng-test-pass!"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ["username"]

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.LazyAttribute(lambda o: o.email)
    password = factory.django.Password(TEST_PASSWORD)


class NoteFactory(factory.django.DjangoModelFactory):
    """Note factory.

    ``category`` defaults to the migration-seeded "Random Thoughts" rather
    than creating new categories — the category table is fixed seed data.
    """

    class Meta:
        model = Note

    title = factory.Sequence(lambda n: f"Note {n}")
    content = factory.Faker("paragraph")
    owner = factory.SubFactory(UserFactory)
    category = factory.LazyFunction(get_default_category)
