from typing import Literal, Optional

Sport = Literal["windsurf", "wakesurf", "wakeboard", "sup", "kayak", "diving"]
Level = Literal["beginner", "intermediate", "advanced"]

# Wind speed ranges (km/h) per sport per level
# None = sport is boat-towed, wind speed is not the limiting factor
WIND_RANGES = {
    "windsurf": {
        "beginner":     {"min": 8,  "max": 20},
        "intermediate": {"min": 15, "max": 35},
        "advanced":     {"min": 20, "max": 60},
    },
    "sup": {
        "beginner":     {"min": 0,  "max": 12},
        "intermediate": {"min": 0,  "max": 20},
        "advanced":     {"min": 0,  "max": 40},
    },
    "kayak": {
        "beginner":     {"min": 0,  "max": 15},
        "intermediate": {"min": 0,  "max": 25},
        "advanced":     {"min": 0,  "max": 50},
    },
    # Boat-dependent sports — wind affects surface conditions and boat ride out
    # but not the underwater activity itself. Lightning is still a hard stop.
    "wakesurf":  {"beginner": None, "intermediate": None, "advanced": None},
    "wakeboard": {"beginner": None, "intermediate": None, "advanced": None},
    "diving":    {"beginner": None, "intermediate": None, "advanced": None},
}

LIGHTNING_DANGER_KM = 10   # hard stop — get off water
LIGHTNING_WARNING_KM = 20  # watch and prepare to exit


def get_verdict(
    sport: Sport,
    level: Level,
    wind_kmh: float,
    nearest_lightning_km: Optional[float] = None,
) -> dict:
    # Lightning overrides everything — always check first
    if nearest_lightning_km is not None:
        if nearest_lightning_km <= LIGHTNING_DANGER_KM:
            return {
                "status": "danger",
                "label": "Get off the water",
                "reason": (
                    f"Lightning detected {round(nearest_lightning_km, 1)} km away. "
                    "Clear the water immediately."
                ),
            }
        if nearest_lightning_km <= LIGHTNING_WARNING_KM:
            return {
                "status": "warning",
                "label": "Storm approaching",
                "reason": (
                    f"Lightning {round(nearest_lightning_km, 1)} km away. "
                    "Watch conditions and be ready to exit the water."
                ),
            }

    wind_range = WIND_RANGES.get(sport, {}).get(level)

    # Boat-towed sports are not wind-dependent
    if wind_range is None:
        reason = (
            "Wind doesn't affect you underwater, but check surface conditions "
            "and the boat ride out. Lightning is still a hard stop."
            if sport == "diving"
            else "Wind conditions don't affect boat-towed sports. Check for lightning and rain."
        )
        return {"status": "good", "label": "Good to go", "reason": reason}

    if wind_kmh < wind_range["min"]:
        return {
            "status": "marginal",
            "label": "Too calm",
            "reason": (
                f"Wind is {wind_kmh} km/h — below the {wind_range['min']} km/h "
                f"you need for {sport}."
            ),
        }
    if wind_kmh > wind_range["max"]:
        return {
            "status": "danger",
            "label": "Too strong",
            "reason": (
                f"Wind is {wind_kmh} km/h — above the safe limit of "
                f"{wind_range['max']} km/h for a {level} {sport}er."
            ),
        }

    return {
        "status": "good",
        "label": "Good to go",
        "reason": f"Wind at {wind_kmh} km/h is ideal for {level} {sport}.",
    }