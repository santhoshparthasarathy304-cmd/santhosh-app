import json
import logging
import os
import re
import urllib.parse
import urllib.request

from django.db import transaction
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from .models import (
    AssistantFeedback,
    AssistantMessage,
    FAQ,
    GameProfile,
    SupportTicket,
    VehicleOwnership,
)

logger = logging.getLogger(__name__)

UPGRADE_CATALOG = {
    "tires": {"name": "Performance tires", "base_price": 120, "max_level": 5},
    "lights": {"name": "Auxiliary lights", "base_price": 160, "max_level": 3},
    "engine": {"name": "Engine power", "base_price": 200, "max_level": 5},
    "top_speed": {"name": "Top speed", "base_price": 250, "max_level": 5},
    "brakes": {"name": "Braking system", "base_price": 140, "max_level": 5},
}

ERROR_GUIDE = {
    "400": "The request was invalid. Check the submitted fields and try again.",
    "401": "Sign in is required to access this resource.",
    "403": "The request was forbidden. Refresh the page to renew its security token.",
    "404": "That page or game resource could not be found.",
    "429": "Too many requests were sent. Wait briefly before trying again.",
    "500": "The server encountered an unexpected error. Try again later.",
    "503": "A required service is temporarily unavailable. Try again shortly.",
    "NR-100": "The game could not complete this action. Your balance was not changed; refresh and retry.",
}

_mongo_client = None


def ensure_game_profile(user):
    from .models import GameVehicle

    starter_vehicle = GameVehicle.objects.get(slug="street-compact")
    with transaction.atomic():
        profile, _ = GameProfile.objects.get_or_create(user=user)
        starter_ownership, _ = VehicleOwnership.objects.get_or_create(
            user=user,
            vehicle=starter_vehicle,
        )
        if profile.selected_vehicle_id is None:
            profile.selected_vehicle = starter_ownership.vehicle
            profile.save(update_fields=["selected_vehicle"])
    return profile


def vehicle_specs(ownership):
    vehicle = ownership.vehicle
    levels = {upgrade.upgrade_type: upgrade.level for upgrade in ownership.upgrades.all()}
    return {
        "acceleration": round(vehicle.acceleration * (1 + 0.12 * levels.get("engine", 0)), 2),
        "top_speed": vehicle.top_speed + 8 * levels.get("top_speed", 0),
        "grip": round(vehicle.grip + 0.12 * levels.get("tires", 0), 2),
        "braking": round(vehicle.braking + 0.12 * levels.get("brakes", 0), 2),
        "lights_level": levels.get("lights", 0),
        "paint": vehicle.paint,
        "upgrade_levels": levels,
    }


def next_upgrade_price(upgrade_type, current_level):
    definition = UPGRADE_CATALOG[upgrade_type]
    return definition["base_price"] * (current_level + 1)


def _mongo_collection(collection_name):
    global _mongo_client
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        return None

    if _mongo_client is None:
        _mongo_client = MongoClient(
            uri,
            serverSelectionTimeoutMS=900,
            connectTimeoutMS=900,
            socketTimeoutMS=1200,
        )
    try:
        _mongo_client.admin.command("ping")
    except PyMongoError:
        logger.warning("MongoDB log write unavailable; SQL storage will be used.")
        return None
    database_name = os.environ.get("MONGODB_DATABASE", "neon_rush")
    return _mongo_client[database_name][collection_name]


def store_assistant_message(user, question, answer):
    message = AssistantMessage.objects.create(
        user=user if user.is_authenticated else None,
        question=question,
        answer=answer,
    )
    collection = _mongo_collection("chat_logs")
    if collection is not None:
        try:
            collection.insert_one(
                {
                    "message_id": message.pk,
                    "user_id": user.pk if user.is_authenticated else None,
                    "question": question,
                    "answer": answer,
                    "created_at": message.created_at,
                }
            )
        except PyMongoError:
            logger.warning("MongoDB chat log write failed; message is in SQL.")
    return message


def store_assistant_feedback(message, was_helpful, comment):
    feedback = AssistantFeedback.objects.create(
        message=message,
        was_helpful=was_helpful,
        comment=comment,
    )
    collection = _mongo_collection("feedback")
    if collection is not None:
        try:
            collection.insert_one(
                {
                    "message_id": message.pk,
                    "was_helpful": was_helpful,
                    "comment": comment,
                    "created_at": feedback.created_at,
                }
            )
        except PyMongoError:
            logger.warning("MongoDB feedback write failed; feedback is in SQL.")
    return feedback


def _faq_answer(question):
    stop_words = {
        "a", "an", "are", "can", "do", "does", "for", "how", "i", "in",
        "is", "it", "me", "my", "of", "on", "or", "please", "the", "to",
        "what", "you",
    }
    normalized = set(re.findall(r"[a-z0-9]+", question.lower())) - stop_words
    if not normalized:
        return None
    best_faq = None
    best_score = 0.0
    for faq in FAQ.objects.filter(is_published=True):
        faq_words = set(re.findall(r"[a-z0-9]+", faq.question.lower())) - stop_words
        score = len(normalized & faq_words) / len(normalized)
        if score > best_score:
            best_faq, best_score = faq, score
    return best_faq.answer if best_faq and best_score >= 0.35 else None


def _gemini_answer(question, faq_context, error_context, player_context):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + urllib.parse.quote(model, safe="-")
        + ":generateContent?key="
        + urllib.parse.quote(api_key, safe="")
    )
    prompt = (
        "You are the Neon Rush driving-game support assistant. Answer only from "
        "the supplied FAQs, error guide, and player data. Do not invent prices, "
        "features, purchases, or account facts. If the context is insufficient, "
        "say you cannot verify it and recommend a support ticket. "
        f"\nFAQS:\n{faq_context}\nERROR GUIDE:\n{error_context}"
        f"\nPLAYER DATA:\n{player_context}\nQUESTION:\n{question}"
    )
    payload = json.dumps(
        {"contents": [{"parts": [{"text": prompt}]}]},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (OSError, ValueError, KeyError, IndexError) as exc:
        logger.warning("Gemini assistant request failed: %s", exc.__class__.__name__)
        return None


def answer_assistant(question, user):
    error_match = re.search(r"\b(400|401|403|404|429|500|503|NR-100)\b", question, re.I)
    if error_match:
        code = error_match.group(1).upper()
        return ERROR_GUIDE[code], None

    faqs = list(FAQ.objects.filter(is_published=True).values("question", "answer"))
    faq_context = "\n".join(f"Q: {item['question']}\nA: {item['answer']}" for item in faqs)
    player_context = "No signed-in player data is available."
    if user.is_authenticated:
        profile = ensure_game_profile(user)
        player_context = f"Currency balance: {profile.balance}."
        if profile.selected_vehicle_id:
            ownership = VehicleOwnership.objects.get(
                user=user,
                vehicle=profile.selected_vehicle,
            )
            player_context += (
                f" Selected car: {ownership.vehicle.name}; "
                f"specifications: {vehicle_specs(ownership)}."
            )
    generated = _gemini_answer(
        question,
        faq_context,
        json.dumps(ERROR_GUIDE),
        player_context,
    )
    if generated:
        return generated, None

    faq_answer = _faq_answer(question)
    if faq_answer:
        return faq_answer, None

    ticket = SupportTicket.objects.create(
        user=user if user.is_authenticated else None,
        subject="Assistant could not answer",
        message=question,
    )
    return (
        f"I couldn't verify an answer from the game guide. I created support "
        f"ticket #{ticket.pk}; our team can follow up.",
        ticket.pk,
    )
