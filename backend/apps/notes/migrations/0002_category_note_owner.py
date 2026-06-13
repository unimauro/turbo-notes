"""Categories (+seed) and per-user ownership for notes.

Handwritten so the FK additions are non-nullable in one pass: the app has
never shipped with note data (fresh product), so the ``default=1`` on the
new columns exists only to satisfy the schema editor for hypothetical
existing rows (``preserve_default=False`` keeps it out of model state).
Seeding runs *before* the category FK is added so pk=1 (Random Thoughts)
is guaranteed to exist.
"""

from django.conf import settings
from django.db import migrations, models

SEED_CATEGORIES = [
    ("Random Thoughts", "coral"),
    ("School", "yellow"),
    ("Personal", "teal"),
    ("Drama", "lavender"),
]


def seed_categories(apps, _schema_editor):
    Category = apps.get_model("notes", "Category")
    for name, color in SEED_CATEGORIES:
        Category.objects.get_or_create(name=name, defaults={"color": color})


def unseed_categories(apps, _schema_editor):
    Category = apps.get_model("notes", "Category")
    Category.objects.filter(name__in=[name for name, _ in SEED_CATEGORIES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("name", models.CharField(max_length=64, unique=True)),
                (
                    "color",
                    models.CharField(
                        choices=[
                            ("coral", "Coral"),
                            ("yellow", "Yellow"),
                            ("teal", "Teal"),
                            ("lavender", "Lavender"),
                        ],
                        max_length=16,
                    ),
                ),
            ],
            options={"ordering": ["id"], "verbose_name_plural": "categories"},
        ),
        migrations.RunPython(seed_categories, unseed_categories),
        migrations.AlterField(
            model_name="note",
            name="title",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="note",
            name="category",
            field=models.ForeignKey(
                default=1,
                on_delete=models.PROTECT,
                related_name="notes",
                to="notes.category",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="note",
            name="owner",
            field=models.ForeignKey(
                default=1,
                on_delete=models.CASCADE,
                related_name="notes",
                to=settings.AUTH_USER_MODEL,
            ),
            preserve_default=False,
        ),
    ]
