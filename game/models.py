from django.conf import settings
from django.db import models
from django.utils import timezone


class GameScore(models.Model):
    player_name = models.CharField(max_length=20)
    score = models.PositiveIntegerField()
    distance = models.PositiveIntegerField()
    coins = models.PositiveIntegerField(default=0)
    played_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_scores",
    )

    class Meta:
        ordering = ["-score", "played_at"]
        verbose_name = "game score"
        verbose_name_plural = "game scores"

    def __str__(self):
        return f"{self.player_name}: {self.score}"


class GameProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_profile",
    )
    balance = models.PositiveIntegerField(default=1000)
    selected_vehicle = models.ForeignKey(
        "GameVehicle",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="selected_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s garage"


class GameVehicle(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=60)
    price = models.PositiveIntegerField()
    acceleration = models.FloatField()
    top_speed = models.PositiveIntegerField()
    grip = models.FloatField()
    braking = models.FloatField()
    paint = models.CharField(max_length=7, default="#51f2dc")
    available = models.BooleanField(default=True)

    class Meta:
        ordering = ["price", "name"]

    def __str__(self):
        return self.name


class VehicleOwnership(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_vehicles",
    )
    vehicle = models.ForeignKey(GameVehicle, on_delete=models.PROTECT)
    acquired_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "vehicle"],
                name="unique_user_vehicle",
            )
        ]

    def __str__(self):
        return f"{self.user.username}: {self.vehicle.name}"


class VehicleUpgrade(models.Model):
    UPGRADE_TYPES = [
        ("tires", "Performance tires"),
        ("lights", "Auxiliary lights"),
        ("engine", "Engine power"),
        ("top_speed", "Top speed"),
        ("brakes", "Braking system"),
    ]

    ownership = models.ForeignKey(
        VehicleOwnership,
        on_delete=models.CASCADE,
        related_name="upgrades",
    )
    upgrade_type = models.CharField(max_length=20, choices=UPGRADE_TYPES)
    level = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["ownership", "upgrade_type"],
                name="unique_vehicle_upgrade",
            )
        ]

    def __str__(self):
        return f"{self.ownership}: {self.upgrade_type} {self.level}"


class GameTransaction(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_transactions",
    )
    request_id = models.CharField(max_length=64)
    transaction_type = models.CharField(max_length=24)
    amount = models.IntegerField()
    description = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "request_id"],
                name="unique_user_game_request",
            )
        ]

    def __str__(self):
        return f"{self.user.username}: {self.description} ({self.amount:+d})"


class FAQ(models.Model):
    question = models.CharField(max_length=180, unique=True)
    answer = models.TextField()
    category = models.CharField(max_length=40, default="Gameplay")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "question"]
        verbose_name = "frequently asked question"
        verbose_name_plural = "frequently asked questions"

    def __str__(self):
        return self.question


class SupportTicket(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_progress", "In progress"),
        ("resolved", "Resolved"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    email = models.EmailField(blank=True)
    subject = models.CharField(max_length=180)
    message = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="open")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Ticket #{self.pk}: {self.subject}"


class AssistantMessage(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    question = models.CharField(max_length=500)
    answer = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class AssistantFeedback(models.Model):
    message = models.OneToOneField(
        AssistantMessage,
        on_delete=models.CASCADE,
        related_name="feedback",
    )
    was_helpful = models.BooleanField()
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
