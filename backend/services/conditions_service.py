"""
Turns raw NEA feed results into an Observation for the rules engine.

No network and no database here, so every helper is unit-testable. The route calls the
NEA fetchers (wrapped in try/except), then passes the results in. A feed that failed is
passed as None, which the rules engine treats as unavailable, never as zero or "none".

Lightning note: services/nea.get_lightning() stamps its result with the fetch time, so a
successful fetch has an age of about 0 and a failed fetch is None. The 10 minute
freshness limit therefore means "time since the last successful fetch".
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from services.conditions_rules import (
    Observation,
    LightningObservation,
    DEFAULT_LIGHTNING_RADIUS_KM,
    DEFAULT_LIGHTNING_LOOKBACK_MIN,
)

EARTH_RADIUS_KM = 6371.0088


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def parse_iso(ts) -> Optional[datetime]:
    """Parse an ISO timestamp. Naive timestamps return None: an unknown timezone is unknown age."""
    if not isinstance(ts, str) or not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo is not None else None


def age_minutes(ts, now: Optional[datetime] = None) -> Optional[float]:
    """Minutes since ts. None if unparseable, or if ts is more than 5 minutes in the future."""
    dt = parse_iso(ts)
    if dt is None:
        return None
    now = now or datetime.now(timezone.utc)
    minutes = (now - dt).total_seconds() / 60
    if minutes < -5:
        return None
    return max(minutes, 0.0)


def nearest_station(readings, lat: float, lng: float, value_key: str) -> Optional[dict]:
    """Closest reading that has coordinates and a finite value. Stations are proxies,
    so the distance is returned for display."""
    best = None
    for r in readings or []:
        rl, rg, v = r.get("lat"), r.get("lng"), r.get(value_key)
        if not (_finite(rl) and _finite(rg) and _finite(v)):
            continue
        d = haversine_km(lat, lng, rl, rg)
        if best is None or d < best["distance_km"]:
            best = {
                "station_id": r.get("station_id"),
                "station_name": r.get("station_name"),
                "value": v,
                "distance_km": d,
            }
    return best


def lightning_summary(
    strikes,
    lat: float,
    lng: float,
    radius_km: float,
    lookback_min: int,
    age_min: Optional[float],
) -> LightningObservation:
    dists = [
        haversine_km(lat, lng, s["lat"], s["lng"])
        for s in (strikes or [])
        if _finite(s.get("lat")) and _finite(s.get("lng"))
    ]
    within = [d for d in dists if d <= radius_km]
    return LightningObservation(
        strike_count=len(within),
        nearest_km=min(dists) if dists else None,
        age_min=age_min,
        radius_km=radius_km,
        lookback_min=lookback_min,
    )


def build_observation(
    wind: Optional[dict],
    direction: Optional[dict],
    lightning: Optional[dict],
    lat: float,
    lng: float,
    now: Optional[datetime] = None,
    radius_km: float = DEFAULT_LIGHTNING_RADIUS_KM,
    lookback_min: int = DEFAULT_LIGHTNING_LOOKBACK_MIN,
):
    """Return (Observation, meta). Any feed passed as None stays unavailable."""
    w = nearest_station(wind["readings"], lat, lng, "value_kmh") if wind else None
    d = nearest_station(direction["readings"], lat, lng, "degrees") if direction else None
    wind_age = age_minutes(wind.get("timestamp"), now) if wind else None

    li = None
    if lightning is not None:
        li = lightning_summary(
            lightning.get("strikes"), lat, lng, radius_km, lookback_min,
            age_minutes(lightning.get("timestamp"), now),
        )

    obs = Observation(
        wind_kmh=w["value"] if w else None,
        gust_kmh=None,  # no gust feed yet (provider decision C3)
        wind_from_deg=d["value"] if d else None,
        wind_age_min=wind_age,
        lightning=li,
    )

    def _station_meta(s):
        if not s:
            return None
        return {
            "station_id": s["station_id"],
            "station_name": s["station_name"],
            "distance_km": round(s["distance_km"], 1),
        }

    meta = {
        "wind_station": _station_meta(w),
        "direction_station": _station_meta(d),
        "wind_observed_at": wind.get("timestamp") if wind else None,
        "lightning_fetched_at": lightning.get("timestamp") if lightning else None,
    }
    return obs, meta
