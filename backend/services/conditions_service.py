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
from datetime import datetime, timedelta, timezone
from typing import Optional

from services.conditions_rules import (
    Observation,
    LightningObservation,
    DEFAULT_LIGHTNING_RADIUS_KM,
    DEFAULT_LIGHTNING_LOOKBACK_MIN,
    KMH_PER_KNOT,
    WIND_STALE_MIN,
    LIGHTNING_STALE_MIN,
)

DISCLAIMER = (
    "WSK shows weather data and reference ranges for information only. It is not safety "
    "advice and does not replace official advisories or your operator's decisions."
)
# Confirm the correct official advisory links (Conditions v3, decision C6).
OFFICIAL_ADVISORIES = [{"label": "Meteorological Service Singapore", "url": "https://www.weather.gov.sg/"}]
# Flags that report facts. These are shown even when guidance is not yet published.
FACTUAL_FLAG_CODES = {"lightning_observed", "no_strikes_observed"}

EARTH_RADIUS_KM = 6371.0088
SGT = timezone(timedelta(hours=8))


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


def nearest_station(readings, lat: float, lng: float, value_key: str,
                    preferred_id: Optional[str] = None) -> Optional[dict]:
    """Pick the reading to use for a spot. If the spot has a mapped station that has a
    valid reading in this feed, use it. Otherwise use the closest reading that has
    coordinates and a finite value. Stations are proxies, so the distance and how the
    station was chosen are returned for display."""
    best = None
    preferred = None
    for r in readings or []:
        v = r.get(value_key)
        if not _finite(v):
            continue
        rl, rg = r.get("lat"), r.get("lng")
        has_coords = _finite(rl) and _finite(rg)
        d = haversine_km(lat, lng, rl, rg) if has_coords else None
        cand = {
            "station_id": r.get("station_id"),
            "station_name": r.get("station_name"),
            "value": v,
            "distance_km": d,
            "selection": "nearest",
        }
        if preferred_id and r.get("station_id") == preferred_id:
            preferred = dict(cand, selection="mapped")
        if has_coords and (best is None or d < best["distance_km"]):
            best = cand
    return preferred or best


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
    preferred_station_id: Optional[str] = None,
):
    """Return (Observation, meta). Any feed passed as None stays unavailable."""
    w = (nearest_station(wind["readings"], lat, lng, "value_kmh", preferred_station_id)
         if wind else None)
    d = (nearest_station(direction["readings"], lat, lng, "degrees", preferred_station_id)
         if direction else None)
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
            "distance_km": round(s["distance_km"], 1) if s["distance_km"] is not None else None,
            "selection": s["selection"],
        }

    meta = {
        "wind_station": _station_meta(w),
        "direction_station": _station_meta(d),
        "wind_observed_at": wind.get("timestamp") if wind else None,
        "lightning_fetched_at": lightning.get("timestamp") if lightning else None,
    }
    return obs, meta


def _to_sgt(ts):
    """Render an ISO timestamp in Singapore time. Unparseable values are returned as given."""
    dt = parse_iso(ts)
    return dt.astimezone(SGT).isoformat() if dt else ts


def _proxy_note(meta: dict) -> Optional[str]:
    s = meta.get("wind_station")
    if not s:
        return None
    dist = s.get("distance_km")
    if dist is not None and dist <= 1:
        return None
    how = ("the station mapped to this spot" if s.get("selection") == "mapped"
           else "the nearest station that reports wind")
    where = f"{dist} km from this spot" if dist is not None else "at an unknown distance from this spot"
    return (f"Wind readings come from {s['station_name']}, {where} ({how}). "
            "Conditions at the spot can differ.")


def build_payload(spot: dict, activity: str, level: str, obs: Observation, meta: dict,
                  assessment, publish_guidance: bool, now: Optional[datetime] = None) -> dict:
    """Assemble the public response. Observations are always facts with their source and age.
    Guidance is shown only if the rules are instructor-reviewed (or in preview mode)."""
    now = now or datetime.now(timezone.utc)

    wind = None
    if obs.wind_kmh is not None:
        wind = {
            "kmh": round(obs.wind_kmh, 1),
            "knots": round(obs.wind_kmh / KMH_PER_KNOT, 1),
            "from_deg": obs.wind_from_deg,
            "station": meta.get("wind_station"),
            "direction_station": meta.get("direction_station"),
            "observed_at": _to_sgt(meta.get("wind_observed_at")),
            "age_min": round(obs.wind_age_min, 1) if obs.wind_age_min is not None else None,
            "stale": obs.wind_age_min is None or obs.wind_age_min > WIND_STALE_MIN,
            "note": _proxy_note(meta),
        }

    lightning = None
    if obs.lightning is not None:
        li = obs.lightning
        lightning = {
            "strikes_within_radius": li.strike_count,
            "nearest_km": round(li.nearest_km, 1) if li.nearest_km is not None else None,
            "radius_km": li.radius_km,
            "lookback_min": li.lookback_min,
            "fetched_at": _to_sgt(meta.get("lightning_fetched_at")),
            "age_min": round(li.age_min, 1) if li.age_min is not None else None,
            "stale": li.age_min is None or li.age_min > LIGHTNING_STALE_MIN,
        }

    if publish_guidance:
        guidance = {
            "status": assessment.status,
            "summary": assessment.summary,
            "flags": [vars(f) for f in assessment.flags],
        }
    else:
        guidance = {
            "status": "not_published",
            "summary": "Guidance for this sport and level is awaiting instructor review.",
            "flags": [vars(f) for f in assessment.flags if f.code in FACTUAL_FLAG_CODES],
        }
    guidance.update({
        "review_status": assessment.review_status,
        "rule_version": assessment.rule_version,
        "rules_engine_version": assessment.rules_engine_version,
    })

    return {
        "spot": spot,
        "activity": activity,
        "level": level,
        "generated_at": now.astimezone(SGT).isoformat(),
        "observations": {"wind": wind, "gusts": None, "lightning": lightning},
        "guidance": guidance,
        "sources": ["NEA via data.gov.sg"],
        "official_advisories": OFFICIAL_ADVISORIES,
        "disclaimer": DISCLAIMER,
    }
