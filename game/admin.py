from django.contrib import admin

from .models import (
    AssistantFeedback,
    AssistantMessage,
    FAQ,
    GameProfile,
    GameScore,
    GameTransaction,
    GameVehicle,
    SupportTicket,
    VehicleOwnership,
    VehicleUpgrade,
)


@admin.register(GameScore)
class GameScoreAdmin(admin.ModelAdmin):
    list_display = ("player_name", "score", "distance", "coins", "played_at")
    list_filter = ("played_at",)
    search_fields = ("player_name",)
    ordering = ("-score", "played_at")


admin.site.register(
    [
        AssistantFeedback,
        AssistantMessage,
        FAQ,
        GameProfile,
        GameTransaction,
        GameVehicle,
        SupportTicket,
        VehicleOwnership,
        VehicleUpgrade,
    ]
)
