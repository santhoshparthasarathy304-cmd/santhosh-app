from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from .models import GameScore

MAX_DISTANCE = 10_000_000
MAX_COINS = 100_000


def home(request):
    scores = GameScore.objects.all()[:10]
    return render(request, "game/home.html", {"scores": scores})


def play(request):
    return render(request, "game/game.html")


def leaderboard(request):
    scores = GameScore.objects.all()[:10]
    return render(request, "game/leaderboard.html", {"scores": scores})


@require_POST
def save_score(request):
    player_name = request.POST.get("player_name", "").strip()
    if not player_name or len(player_name) > 20:
        return JsonResponse(
            {"ok": False, "error": "Enter a name between 1 and 20 characters."},
            status=400,
        )

    try:
        distance = int(request.POST.get("distance", ""))
        coins = int(request.POST.get("coins", ""))
    except (TypeError, ValueError):
        return JsonResponse(
            {"ok": False, "error": "The submitted game result is invalid."},
            status=400,
        )

    if not 0 <= distance <= MAX_DISTANCE or not 0 <= coins <= MAX_COINS:
        return JsonResponse(
            {"ok": False, "error": "The submitted game result is out of range."},
            status=400,
        )

    score = distance // 10 + coins * 100
    result = GameScore.objects.create(
        player_name=player_name,
        score=score,
        distance=distance,
        coins=coins,
    )
    return JsonResponse({"ok": True, "score": result.score})
