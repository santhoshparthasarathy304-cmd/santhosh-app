from django.urls import path

from . import views

app_name = "game"

urlpatterns = [
    path("", views.home, name="home"),
    path("play/", views.play, name="play"),
    path("leaderboard/", views.leaderboard, name="leaderboard"),
    path("scores/", views.save_score, name="save_score"),
]
