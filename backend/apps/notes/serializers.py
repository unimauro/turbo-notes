from rest_framework import serializers

from .models import Note


class NoteSerializer(serializers.ModelSerializer):
    """Serializer for Note CRUD.

    ``title`` is explicitly declared so whitespace-only titles fail validation
    with a clear message (DRF's default CharField already rejects blank, but we
    add ``trim_whitespace`` + a friendly error to make the contract explicit).
    """

    title = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
        error_messages={
            "blank": "Title cannot be blank.",
            "required": "Title is required.",
        },
    )

    class Meta:
        model = Note
        fields = ["id", "title", "content", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
