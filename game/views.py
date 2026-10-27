import json
import logging
import math
import urllib.parse
import urllib.request

from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from django.core.cache import cache
from django.db import DatabaseError, transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required

from .models import (
    AssistantFeedback,
    AssistantMessage,
    FAQ,
    GameProfile,
    GameScore,
    GameTransaction,
    GameVehicle,
    VehicleOwnership,
    VehicleUpgrade,
)
from .services import (
    ERROR_GUIDE,
    UPGRADE_CATALOG,
    answer_assistant,
    ensure_game_profile,
    next_upgrade_price,
    store_assistant_feedback,
    store_assistant_message,
    vehicle_specs,
)

logger = logging.getLogger(__name__)
MAX_DISTANCE = 10_000_000
MAX_COINS = 100_000
DAILY_REWARD = 50


def home(request):
    scores = GameScore.objects.all()[:10]
    return render(request, "game/home.html", {"scores": scores})


def play(request):
    game_config = {}
    if request.user.is_authenticated:
        profile = ensure_game_profile(request.user)
        if profile.selected_vehicle_id:
            ownership = VehicleOwnership.objects.get(
                user=request.user,
                vehicle=profile.selected_vehicle,
            )
            game_config = {
                "specs": vehicle_specs(ownership),
                "vehicle": ownership.vehicle.name,
            }
    return render(request, "game/game.html", {"game_config": game_config})


def leaderboard(request):
    scores = GameScore.objects.all()[:10]
    return render(request, "game/leaderboard.html", {"scores": scores})


def _json_body(request):
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return data if isinstance(data, dict) else None
    return request.POST


def _client_request_id(data):
    request_id = str(data.get("request_id", "")).strip()
    if not request_id or len(request_id) > 64:
        return None
    return request_id


def _profile_json(profile):
    ownerships = VehicleOwnership.objects.filter(user=profile.user).select_related(
        "vehicle"
    )
    owned = []
    for ownership in ownerships:
        owned.append(
            {
                "slug": ownership.vehicle.slug,
                "name": ownership.vehicle.name,
                "selected": profile.selected_vehicle_id == ownership.vehicle_id,
                "specs": vehicle_specs(ownership),
            }
        )
    return {
        "balance": profile.balance,
        "selected_vehicle": profile.selected_vehicle.slug
        if profile.selected_vehicle_id
        else None,
        "owned_vehicles": owned,
    }


def garage(request):
    if not request.user.is_authenticated:
        return redirect(f"{reverse('game:login')}?next={reverse('game:garage')}")
    profile = ensure_game_profile(request.user)
    owned_ids = set(
        VehicleOwnership.objects.filter(user=request.user).values_list(
            "vehicle_id", flat=True
        )
    )
    vehicles = GameVehicle.objects.filter(available=True)
    ownership_by_vehicle = {
        ownership.vehicle_id: ownership
        for ownership in VehicleOwnership.objects.filter(
            user=request.user
        ).select_related("vehicle")
    }
    catalog = [
        {
            "vehicle": vehicle,
            "ownership": ownership_by_vehicle.get(vehicle.pk),
            "specs": (
                vehicle_specs(ownership_by_vehicle[vehicle.pk])
                if vehicle.pk in ownership_by_vehicle
                else {
                    "acceleration": vehicle.acceleration,
                    "top_speed": vehicle.top_speed,
                    "grip": vehicle.grip,
                    "braking": vehicle.braking,
                    "lights_level": 0,
                    "paint": vehicle.paint,
                    "upgrade_levels": {},
                }
            ),
        }
        for vehicle in vehicles
    ]
    selected_ownership = ownership_by_vehicle.get(profile.selected_vehicle_id)
    selected_levels = (
        {
            upgrade.upgrade_type: upgrade.level
            for upgrade in selected_ownership.upgrades.all()
        }
        if selected_ownership
        else {}
    )
    upgrade_cards = [
        {
            "key": key,
            "name": definition["name"],
            "level": selected_levels.get(key, 0),
            "max_level": definition["max_level"],
            "price": next_upgrade_price(key, selected_levels.get(key, 0)),
            "effect": {
                "tires": "More grip and cornering control",
                "lights": "Brighter auxiliary headlights",
                "engine": "Quicker acceleration",
                "top_speed": "Higher top speed",
                "brakes": "Stronger braking response",
            }[key],
        }
        for key, definition in UPGRADE_CATALOG.items()
    ]
    return render(
        request,
        "game/garage.html",
        {
            "profile": profile,
            "owned_vehicle_ids": owned_ids,
            "catalog": catalog,
            "upgrade_cards": upgrade_cards,
            "selected_slug": profile.selected_vehicle.slug
            if profile.selected_vehicle_id
            else "",
            "selected_paint": profile.selected_vehicle.paint
            if profile.selected_vehicle_id
            else "#51f2dc",
            "selected_lights_level": selected_levels.get("lights", 0),
        },
    )


@require_GET
def faq_page(request):
    return render(
        request,
        "game/faq.html",
        {"faqs": FAQ.objects.filter(is_published=True)},
    )


@require_GET
def error_guide(request):
    return render(request, "game/error_guide.html", {"error_guide": ERROR_GUIDE})


def signup(request):
    if request.user.is_authenticated:
        return redirect("game:garage")
    form = UserCreationForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        ensure_game_profile(user)
        login(request, user)
        return redirect("game:garage")
    return render(request, "game/account_form.html", {"form": form, "mode": "signup"})


def login_view(request):
    if request.user.is_authenticated:
        return redirect("game:garage")
    form = AuthenticationForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        login(request, form.get_user())
        ensure_game_profile(request.user)
        destination = request.POST.get("next", "")
        if destination.startswith("/") and not destination.startswith("//"):
            return redirect(destination)
        return redirect("game:garage")
    return render(request, "game/account_form.html", {"form": form, "mode": "login"})


@require_POST
def logout_view(request):
    logout(request)
    return redirect("game:home")


@require_GET
@login_required
def profile_api(request):
    profile = ensure_game_profile(request.user)
    return JsonResponse(_profile_json(profile))


@require_POST
@login_required
def buy_vehicle(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"ok": False, "error": "Invalid JSON data."}, status=400)
    slug = str(data.get("vehicle", "")).strip()
    request_id = _client_request_id(data)
    if not slug or request_id is None:
        return JsonResponse(
            {"ok": False, "error": "Vehicle and request ID are required."},
            status=400,
        )
    vehicle = get_object_or_404(GameVehicle, slug=slug, available=True)
    profile = ensure_game_profile(request.user)

    with transaction.atomic():
        profile = GameProfile.objects.select_for_update().get(pk=profile.pk)
        previous = GameTransaction.objects.filter(
            user=request.user,
            request_id=request_id,
        ).first()
        if previous:
            if previous.transaction_type != "vehicle":
                return JsonResponse(
                    {"ok": False, "error": "That request ID was already used."},
                    status=409,
                )
            return JsonResponse({"ok": True, "duplicate": True, "balance": profile.balance})
        if VehicleOwnership.objects.filter(user=request.user, vehicle=vehicle).exists():
            return JsonResponse(
                {"ok": False, "error": "You already own this vehicle."},
                status=409,
            )
        if profile.balance < vehicle.price:
            return JsonResponse(
                {"ok": False, "error": "Not enough credits.", "balance": profile.balance},
                status=409,
            )
        profile.balance -= vehicle.price
        profile.save(update_fields=["balance"])
        VehicleOwnership.objects.create(user=request.user, vehicle=vehicle)
        GameTransaction.objects.create(
            user=request.user,
            request_id=request_id,
            transaction_type="vehicle",
            amount=-vehicle.price,
            description=f"Purchased {vehicle.name}",
        )
    return JsonResponse({"ok": True, "balance": profile.balance})


@require_POST
@login_required
def buy_upgrade(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"ok": False, "error": "Invalid JSON data."}, status=400)
    upgrade_type = str(data.get("upgrade", "")).strip()
    vehicle_slug = str(data.get("vehicle", "")).strip()
    request_id = _client_request_id(data)
    if upgrade_type not in UPGRADE_CATALOG or not vehicle_slug or request_id is None:
        return JsonResponse(
            {"ok": False, "error": "Choose a valid upgrade and request ID."},
            status=400,
        )

    ownership = get_object_or_404(
        VehicleOwnership.objects.select_related("vehicle"),
        user=request.user,
        vehicle__slug=vehicle_slug,
    )
    profile = ensure_game_profile(request.user)
    with transaction.atomic():
        profile = GameProfile.objects.select_for_update().get(pk=profile.pk)
        previous = GameTransaction.objects.filter(
            user=request.user,
            request_id=request_id,
        ).first()
        if previous:
            if previous.transaction_type != "upgrade":
                return JsonResponse(
                    {"ok": False, "error": "That request ID was already used."},
                    status=409,
                )
            return JsonResponse({"ok": True, "duplicate": True, "balance": profile.balance})
        upgrade, _ = VehicleUpgrade.objects.get_or_create(
            ownership=ownership,
            upgrade_type=upgrade_type,
        )
        definition = UPGRADE_CATALOG[upgrade_type]
        if upgrade.level >= definition["max_level"]:
            return JsonResponse(
                {"ok": False, "error": "This upgrade is already at maximum level."},
                status=409,
            )
        price = next_upgrade_price(upgrade_type, upgrade.level)
        if profile.balance < price:
            return JsonResponse(
                {"ok": False, "error": "Not enough credits.", "balance": profile.balance},
                status=409,
            )
        profile.balance -= price
        profile.save(update_fields=["balance"])
        upgrade.level += 1
        upgrade.save(update_fields=["level"])
        GameTransaction.objects.create(
            user=request.user,
            request_id=request_id,
            transaction_type="upgrade",
            amount=-price,
            description=f"{definition['name']} level {upgrade.level}",
        )
    return JsonResponse(
        {
            "ok": True,
            "balance": profile.balance,
            "specs": vehicle_specs(ownership),
        }
    )


@require_POST
@login_required
def select_vehicle(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"ok": False, "error": "Invalid JSON data."}, status=400)
    slug = str(data.get("vehicle", "")).strip()
    ownership = get_object_or_404(
        VehicleOwnership.objects.select_related("vehicle"),
        user=request.user,
        vehicle__slug=slug,
    )
    profile = ensure_game_profile(request.user)
    profile.selected_vehicle = ownership.vehicle
    profile.save(update_fields=["selected_vehicle"])
    return JsonResponse(
        {
            "ok": True,
            "vehicle": ownership.vehicle.slug,
            "specs": vehicle_specs(ownership),
        }
    )


@require_POST
@login_required
def claim_daily_reward(request):
    profile = ensure_game_profile(request.user)
    request_id = f"daily:{timezone.localdate().isoformat()}"
    with transaction.atomic():
        profile = GameProfile.objects.select_for_update().get(pk=profile.pk)
        previous = GameTransaction.objects.filter(
            user=request.user,
            request_id=request_id,
        ).first()
        if previous:
            return JsonResponse(
                {"ok": True, "claimed": False, "balance": profile.balance}
            )
        profile.balance += DAILY_REWARD
        profile.save(update_fields=["balance"])
        GameTransaction.objects.create(
            user=request.user,
            request_id=request_id,
            transaction_type="daily",
            amount=DAILY_REWARD,
            description="Daily driving reward",
        )
    return JsonResponse(
        {"ok": True, "claimed": True, "reward": DAILY_REWARD, "balance": profile.balance}
    )


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
        user=request.user if request.user.is_authenticated else None,
    )
    return JsonResponse({"ok": True, "score": result.score})


def _limited(request, endpoint, limit=12):
    client = request.META.get("REMOTE_ADDR", "unknown")
    identity = f"user:{request.user.pk}" if request.user.is_authenticated else client
    key = f"throttle:{endpoint}:{identity}"
    count = cache.get(key, 0)
    if count >= limit:
        return True
    cache.set(key, count + 1, timeout=60)
    return False


@require_POST
def assistant_chat(request):
    if _limited(request, "assistant", limit=10):
        return JsonResponse(
            {"ok": False, "error": ERROR_GUIDE["429"]},
            status=429,
        )
    data = _json_body(request)
    question = str(data.get("question", "")).strip() if data else ""
    if not question or len(question) > 500:
        return JsonResponse(
            {"ok": False, "error": "Ask a question between 1 and 500 characters."},
            status=400,
        )
    answer, ticket_id = answer_assistant(question, request.user)
    message = store_assistant_message(request.user, question, answer)
    return JsonResponse(
        {
            "ok": True,
            "message_id": message.pk,
            "answer": answer,
            "ticket_id": ticket_id,
        }
    )


@require_POST
def assistant_feedback(request):
    data = _json_body(request)
    if not data:
        return JsonResponse({"ok": False, "error": "Invalid JSON data."}, status=400)
    try:
        message_id = int(data.get("message_id"))
        was_helpful = data.get("was_helpful")
        if not isinstance(was_helpful, bool):
            raise ValueError
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "Invalid feedback."}, status=400)
    message = get_object_or_404(AssistantMessage, pk=message_id)
    if message.user_id and (not request.user.is_authenticated or message.user_id != request.user.pk):
        return JsonResponse({"ok": False, "error": "Feedback is not permitted."}, status=403)
    comment = str(data.get("comment", "")).strip()[:500]
    existing = AssistantFeedback.objects.filter(message=message).first()
    if existing:
        return JsonResponse({"ok": True, "duplicate": True})
    store_assistant_feedback(message, was_helpful, comment)
    return JsonResponse({"ok": True})


@require_GET
def road_weather(request):
    if _limited(request, "road-weather", limit=10):
        return JsonResponse(
            {"available": False, "message": ERROR_GUIDE["429"]},
            status=429,
        )
    try:
        latitude = float(request.GET["lat"])
        longitude = float(request.GET["lon"])
    except (KeyError, TypeError, ValueError):
        return JsonResponse(
            {"available": False, "message": "Share location to request local weather."}
        )
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not (
        -90 <= latitude <= 90 and -180 <= longitude <= 180
    ):
        return JsonResponse(
            {"available": False, "message": "Location coordinates are invalid."},
            status=400,
        )
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,weather_code",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "NeonRush/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            payload = json.loads(response.read().decode("utf-8"))
        current = payload["current"]
        return JsonResponse(
            {
                "available": True,
                "temperature_c": current["temperature_2m"],
                "weather_code": current["weather_code"],
            }
        )
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Road-weather provider unavailable: %s", exc.__class__.__name__)
        return JsonResponse(
            {"available": False, "message": "Weather unavailable right now."}
        )


@require_GET
def health_check(_request):
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError as exc:
        logger.error("Health check database query failed: %s", exc.__class__.__name__)
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})


def error_page(request, _exception=None, status=404):
    template = f"game/errors/{status}.html"
    return render(request, template, {"status": status}, status=status)


def bad_request(request, exception=None):
    return error_page(request, exception, 400)


def permission_denied(request, exception=None):
    return error_page(request, exception, 403)


def page_not_found(request, exception=None):
    return error_page(request, exception, 404)


def server_error(request):
    return error_page(request, status=500)
