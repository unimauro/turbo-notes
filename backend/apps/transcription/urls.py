from django.urls import path

from .assist_views import AssistView
from .speak_views import SpeakView
from .views import TranscribeView

urlpatterns = [
    path("transcribe/", TranscribeView.as_view(), name="transcribe"),
    path("speak/", SpeakView.as_view(), name="speak"),
    path("assist/", AssistView.as_view(), name="assist"),
]
