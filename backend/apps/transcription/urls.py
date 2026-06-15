from django.urls import path

from .speak_views import SpeakView
from .views import TranscribeView

urlpatterns = [
    path("transcribe/", TranscribeView.as_view(), name="transcribe"),
    path("speak/", SpeakView.as_view(), name="speak"),
]
