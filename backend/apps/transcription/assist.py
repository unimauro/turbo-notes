"""Thin wrapper around the OpenAI-compatible chat completions API for note
"assist" actions (suggest a title, summarize).

Kept deliberately small and side-effect-free (no Django imports beyond settings)
so tests can mock ``_build_client`` / ``assist`` without touching the network.
Mirrors ``tts.py`` (TTS) and ``services.py`` (Whisper).
"""

from __future__ import annotations

from django.conf import settings

# Supported assist actions. The view rejects anything else with a 400.
ALLOWED_ACTIONS = {"title", "summary"}

# Cap the input we send upstream (keeps the call fast/cheap and bounds cost).
# When exceeded we truncate to the first ``_TRUNCATED_CHARS`` characters.
_MAX_CHARS = 8000
_TRUNCATED_CHARS = 400

# system/user prompt templates per action. ``{text}`` is filled with the note.
_PROMPTS = {
    "title": (
        "You write concise, specific note titles.",
        "Write a short title (max ~8 words, no quotes, no trailing period) "
        "that best captures this note:\n\n{text}",
    ),
    "summary": (
        "You write tight note summaries.",
        "Summarize this note in 1-2 short sentences:\n\n{text}",
    ),
}


class AssistError(Exception):
    """Raised when the upstream provider fails. The message is safe to surface
    to clients (it never includes the API key)."""


def _build_client():
    # Imported lazily so the dependency is only needed when assist is actually
    # configured/used (and so importing this module stays cheap).
    from openai import OpenAI

    return OpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)


def assist(text: str, action: str) -> str:
    """Run an assist ``action`` ("title"/"summary") over ``text``.

    Returns the model's stripped message content. Raises ``AssistError`` on any
    upstream failure (the message never leaks the API key).
    """
    if len(text) > _MAX_CHARS:
        text = text[:_TRUNCATED_CHARS]

    system_prompt, user_template = _PROMPTS[action]
    client = _build_client()
    try:
        result = client.chat.completions.create(
            model=settings.OPENAI_ASSIST_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_template.format(text=text)},
            ],
            temperature=0.4,
        )
        content = result.choices[0].message.content
    except Exception as exc:  # noqa: BLE001 - normalise any provider error
        raise AssistError("AI assist provider request failed") from exc
    return (content or "").strip()
