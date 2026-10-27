from django.db import models


class GameScore(models.Model):
    player_name = models.CharField(max_length=20)
    score = models.PositiveIntegerField()
    distance = models.PositiveIntegerField()
    coins = models.PositiveIntegerField(default=0)
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score", "played_at"]
        verbose_name = "game score"
        verbose_name_plural = "game scores"

    def __str__(self):
        return f"{self.player_name}: {self.score}"
