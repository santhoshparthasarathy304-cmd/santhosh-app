from django.urls import path

from . import views

app_name = "game"

urlpatterns = [
    path("", views.home, name="home"),
    path("play/", views.play, name="play"),
    path("leaderboard/", views.leaderboard, name="leaderboard"),
    path("scores/", views.save_score, name="save_score"),
    path("garage/", views.garage, name="garage"),
    path("faq/", views.faq_page, name="faq"),
    path("errors/", views.error_guide, name="error_guide"),
    path("account/signup/", views.signup, name="signup"),
    path("account/login/", views.login_view, name="login"),
    path("account/logout/", views.logout_view, name="logout"),
    path("api/profile/", views.profile_api, name="profile_api"),
    path("api/vehicles/buy/", views.buy_vehicle, name="buy_vehicle"),
    path("api/vehicles/select/", views.select_vehicle, name="select_vehicle"),
    path("api/upgrades/buy/", views.buy_upgrade, name="buy_upgrade"),
    path("api/rewards/daily/", views.claim_daily_reward, name="daily_reward"),
    path("api/assistant/", views.assistant_chat, name="assistant_chat"),
    path("api/assistant/feedback/", views.assistant_feedback, name="assistant_feedback"),
    path("api/road-weather/", views.road_weather, name="road_weather"),
    path("healthz/", views.health_check, name="health_check"),
]
