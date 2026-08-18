from math import radians, sin, cos, sqrt, atan2
from core.config import settings


def haversine_metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def find_nearest_spot(user_lat: float, user_lng: float, spots: list) -> dict | None:
    """
    Given a list of spots [{name, lat, lng, ...}], return the nearest one
    within CHECKIN_RADIUS_METRES, or None if none qualify.
    """
    nearest = None
    nearest_dist = float("inf")

    for spot in spots:
        dist = haversine_metres(user_lat, user_lng, spot["lat"], spot["lng"])
        if dist < nearest_dist:
            nearest_dist = dist
            nearest = {**spot, "distance_metres": round(dist)}

    if nearest and nearest["distance_metres"] <= settings.CHECKIN_RADIUS_METRES:
        return nearest
    return None
