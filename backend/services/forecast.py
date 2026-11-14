"""
NEA forecast feeds turned into plan-ahead days. Pure functions: no network, no database.

NEA publishes a 24-hour forecast (island-wide wind range, plus weather text per period and
region) and a 4-day outlook (one record per day with a wind range, direction and text).
Both are island-wide and coarse, and the outlook only reaches 4 days ahead, so this is for
planning and says so. The parsers accept the documented field names in both the camelCase and
the older snake_case spellings, and return nothing when the shape is not recognised, so an
unexpected response becomes "forecast unavailable" and never a guess.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from services.conditions_rules import Observation, WindReading, evaluate, kmh_to_knots
from services.conditions_service import (
    DISCLAIMER, SGT, age_minutes, guidance_payload, parse_iso,
)

# Freshness limits in minutes (Full App v2): 4-day outlook 18 hours, 24-hour forecast 6 hours.
FOUR_DAY_STALE_MIN = 18 * 60
H24_STALE_MIN = 6 * 60
MAX_HORIZON_DAYS = 4

SCOPE_NOTE = "Island-wide NEA forecast, not specific to this spot."

CARDINAL_DEG = {
    "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5,
    "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5,
}
_NAMES = {"NORTH": "N", "NORTHEAST": "NE", "EAST": "E", "SOUTHEAST": "SE", "SOUTH": "S",
          "SOUTHWEST": "SW", "WEST": "W", "NORTHWEST": "NW"}
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _num(x) -> Optional[float]:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) else None


def norm_direction(d) -> Optional[str]:
    if not isinstance(d, str):
        return None
    key = d.strip().upper().replace(" ", "").replace("-", "")
    key = _NAMES.get(key, key)
    return key if key in CARDINAL_DEG else None


def _text(v) -> Optional[str]:
    if isinstance(v, dict):
        v = v.get("text") or v.get("summary")
    return v.strip() if isinstance(v, str) and v.strip() else None


def _records(payload) -> list:
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return []
    recs = data.get("records") or data.get("items") or []
    return [r for r in recs if isinstance(r, dict)] if isinstance(recs, list) else []


def _latest(recs: list):
    best = None
    for r in recs:
        issued = r.get("updatedTimestamp") or r.get("update_timestamp") or r.get("timestamp")
        if best is None or (issued or "") >= (best[0] or ""):
            best = (issued, r)
    return best


def _wind(w) -> tuple:
    w = w if isinstance(w, dict) else {}
    speed = w.get("speed") if isinstance(w.get("speed"), dict) else {}
    return _num(speed.get("low")), _num(speed.get("high")), norm_direction(w.get("direction"))


def parse_four_day(payload) -> Optional[dict]:
    best = _latest(_records(payload))
    if best is None:
        return None
    issued, rec = best
    days = []
    for f in rec.get("forecasts") or []:
        if not isinstance(f, dict):
            continue
        date = str(f.get("date") or f.get("timestamp") or "")[:10]
        if not _DATE.match(date):
            continue
        low, high, direction = _wind(f.get("wind"))
        days.append({"date": date, "wind_low": low, "wind_high": high,
                     "direction": direction, "text": _text(f.get("forecast"))})
    return {"issued_at": issued, "days": days}


def parse_24h(payload) -> Optional[dict]:
    best = _latest(_records(payload))
    if best is None:
        return None
    issued, rec = best
    general = rec.get("general") if isinstance(rec.get("general"), dict) else {}
    low, high, direction = _wind(general.get("wind"))
    valid = general.get("validPeriod") or general.get("valid_period") or {}
    periods = []
    for p in rec.get("periods") or []:
        if not isinstance(p, dict):
            continue
        tp = p.get("timePeriod") or p.get("time_period") or p.get("time") or {}
        regions = p.get("regions") if isinstance(p.get("regions"), dict) else {}
        periods.append({
            "start": tp.get("start"), "end": tp.get("end"),
            "regions": {str(k).lower(): _text(v) for k, v in regions.items()},
        })
    return {
        "issued_at": issued, "wind_low": low, "wind_high": high, "direction": direction,
        "text": _text(general.get("forecast")),
        "valid_start": valid.get("start") if isinstance(valid, dict) else None,
        "valid_end": valid.get("end") if isinstance(valid, dict) else None,
        "periods": periods,
    }


def _local_date(iso) -> Optional[str]:
    dt = parse_iso(iso)
    return dt.astimezone(SGT).date().isoformat() if dt else None


def _slot_of(start_iso) -> Optional[tuple]:
    """(date, 'AM' or 'PM') for a period that starts in the morning or afternoon, in Singapore time."""
    dt = parse_iso(start_iso)
    if not dt:
        return None
    local = dt.astimezone(SGT)
    if 6 <= local.hour < 12:
        return local.date().isoformat(), "AM"
    if 12 <= local.hour < 18:
        return local.date().isoformat(), "PM"
    return None


def rules_reviewed(rules, activity_slug: str, level: str) -> bool:
    """True if an instructor has reviewed the wind rule for this activity and level."""
    return any(r.activity_slug == activity_slug and r.level == level
               and r.condition_type == "wind_speed_kmh" and r.reviewed_by for r in rules)


def _fresh(issued_at, now, limit_min) -> bool:
    age = age_minutes(issued_at, now)
    return age is not None and age <= limit_min


def _thundery(*texts) -> bool:
    return any(t and "thunder" in t.lower() for t in texts)


def build_days(four_day, h24, region, rules, activity_slug, level, wind_dependent, sectors,
               publish, now: Optional[datetime] = None, max_days: int = MAX_HORIZON_DAYS) -> list:
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(SGT).date()
    last = today + timedelta(days=max_days)

    # AM and PM weather text from the 24-hour forecast, for the spot's region when known
    slot_text: dict = {}
    h24_dates: set = set()
    if h24:
        for p in h24["periods"]:
            d = _local_date(p["start"])
            if d:
                h24_dates.add(d)
            key = _slot_of(p["start"])
            if key:
                regions = p["regions"]
                text = regions.get(region) if region else None
                slot_text[key] = text or h24.get("text")
        for k in ("valid_start", "valid_end"):
            d = _local_date(h24.get(k))
            if d:
                h24_dates.add(d)

    four_by_date = {d["date"]: d for d in (four_day["days"] if four_day else [])}
    four_fresh = bool(four_day) and _fresh(four_day["issued_at"], now, FOUR_DAY_STALE_MIN)
    h24_fresh = bool(h24) and _fresh(h24["issued_at"], now, H24_STALE_MIN)

    out = []
    for date in sorted(set(four_by_date) | h24_dates | {k[0] for k in slot_text}):
        try:
            day = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            continue
        if not (today <= day <= last):
            continue
        four = four_by_date.get(date)

        low = high = direction = None
        source, fresh, issued = None, False, None
        if four and four["wind_low"] is not None and four["wind_high"] is not None:
            low, high, direction = four["wind_low"], four["wind_high"], four["direction"]
            source, fresh, issued = "nea_4day", four_fresh, four_day["issued_at"]
        elif h24 and date in h24_dates and h24["wind_low"] is not None and h24["wind_high"] is not None:
            low, high, direction = h24["wind_low"], h24["wind_high"], h24["direction"]
            source, fresh, issued = "nea_24h", h24_fresh, h24["issued_at"]

        deg = CARDINAL_DEG.get(direction) if direction else None
        if low is not None:
            obs = Observation(wind_kmh=high, wind_readings=[WindReading(low), WindReading(high)],
                              wind_from_deg=deg, wind_age_min=0 if fresh else None, lightning=None)
        else:
            obs = Observation(lightning=None)
        assessment = evaluate(activity_slug, level, obs, rules, wind_dependent=wind_dependent,
                              sectors=sectors, include_lightning=False,
                              reading_subject="Forecast wind is", reading_all="")

        day_text = (four["text"] if four else None) or (h24["text"] if h24 and date in h24_dates else None)
        slots = {}
        for key in ("AM", "PM"):
            from_24h = slot_text.get((date, key))
            text = from_24h or day_text
            slots[key] = {"text": text, "thundery": _thundery(text),
                          "source": "nea_24h" if from_24h else "daily"}
        out.append({
            "date": date,
            "source": source,
            "issued_at": _sgt(issued),
            "stale": bool(source) and not fresh,
            "wind": None if low is None else {
                "kmh_low": round(low, 1), "kmh_high": round(high, 1),
                "knots_low": round(kmh_to_knots(low), 1), "knots_high": round(kmh_to_knots(high), 1),
                "direction": direction, "from_deg": deg,
            },
            "weather": day_text,
            "thundery": _thundery(day_text, *(s["text"] for s in slots.values())),
            "slots": slots,
            "guidance": guidance_payload(assessment, publish),
        })
    return out


def _sgt(iso) -> Optional[str]:
    dt = parse_iso(iso)
    return dt.astimezone(SGT).isoformat() if dt else None


def build_forecast_payload(spot: dict, activity: str, level: str, days: list, available: bool,
                           now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {
        "spot": spot,
        "activity": activity,
        "level": level,
        "generated_at": now.astimezone(SGT).isoformat(),
        "horizon_days": MAX_HORIZON_DAYS,
        "available": available,
        "days": days,
        "note": SCOPE_NOTE,
        "sources": ["NEA via data.gov.sg"],
        "disclaimer": DISCLAIMER,
    }
