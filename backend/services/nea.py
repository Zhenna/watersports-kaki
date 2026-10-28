import httpx
from datetime import datetime, timedelta, timezone
from core.config import settings

NEA_BASE = settings.NEA_BASE_URL

KNOTS_TO_KMH = 1.852

# Ignore lightning strikes older than this when judging current conditions.
LIGHTNING_WINDOW_MINUTES = 30


def degrees_to_cardinal(deg: float) -> str:
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return dirs[round(deg / 22.5) % 16]


async def _fetch_latest(endpoint: str) -> dict:
    """
    Fetch a realtime NEA readings endpoint and return the latest timestamp group.

    API shape: data.stations[] (id, name, location) and
    data.readings[] -> {timestamp, data: [{stationId, value}]}.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{NEA_BASE}/{endpoint}")
        r.raise_for_status()
        payload = r.json().get("data", {})

    stations = {s["id"]: s for s in payload.get("stations", [])}
    groups = payload.get("readings", [])
    latest = groups[0] if groups else {"timestamp": None, "data": []}

    readings = []
    for rd in latest["data"]:
        st = stations.get(rd["stationId"], {})
        loc = st.get("location", {})
        readings.append({
            "station_id": rd["stationId"],
            "station_name": st.get("name", rd["stationId"]),
            "value": rd["value"],
            "lat": loc.get("latitude"),
            "lng": loc.get("longitude"),
        })

    return {
        "timestamp": latest.get("timestamp"),
        "unit": payload.get("readingUnit"),
        "readings": readings,
    }


async def get_wind_speed() -> dict:
    d = await _fetch_latest("wind-speed")  # NEA reports knots
    return {
        "timestamp": d["timestamp"],
        "readings": [
            {
                "station_id": r["station_id"],
                "station_name": r["station_name"],
                "value_kmh": round(r["value"] * KNOTS_TO_KMH, 1),
                "lat": r["lat"],
                "lng": r["lng"],
            }
            for r in d["readings"]
        ],
    }


async def get_wind_direction() -> dict:
    d = await _fetch_latest("wind-direction")  # degrees
    return {
        "timestamp": d["timestamp"],
        "readings": [
            {
                "station_id": r["station_id"],
                "station_name": r["station_name"],
                "degrees": r["value"],
                "cardinal": degrees_to_cardinal(r["value"]),
                "lat": r["lat"],
                "lng": r["lng"],
            }
            for r in d["readings"]
        ],
    }


async def get_temperature() -> dict:
    d = await _fetch_latest("air-temperature")  # deg C
    return {
        "timestamp": d["timestamp"],
        "readings": [
            {
                "station_id": r["station_id"],
                "station_name": r["station_name"],
                "celsius": r["value"],
                "lat": r["lat"],
                "lng": r["lng"],
            }
            for r in d["readings"]
        ],
    }


async def get_lightning() -> dict:
    """
    Cloud-to-ground (G) and cloud-to-cloud (C) strikes from the latest observation.
    Endpoint: /weather?api=lightning. Updated every ~2-3 minutes with a few
    minutes of transmission delay, so treat results conservatively.

    Response shape (verified): data.records[].item.readings[] where each reading is
    {location: {latitude, longitude} (strings), type: "C"|"G", text, datetime}.
    An empty readings list means no recent strikes.

    Only strikes within LIGHTNING_WINDOW_MINUTES are returned.
    Raises on network/HTTP errors: callers should treat a failure as "unknown",
    not as "no lightning".
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{NEA_BASE}/weather", params={"api": "lightning"})
        if r.status_code == 404:
            # "Weather data not found": no observation available
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "strike_count": 0,
                "strikes": [],
            }
        r.raise_for_status()
        data = r.json().get("data", {})

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LIGHTNING_WINDOW_MINUTES)
    strikes = []
    for rec in data.get("records", []):
        for rd in rec.get("item", {}).get("readings", []):
            loc = rd.get("location", {})
            lat, lng = loc.get("latitude"), loc.get("longitude")
            if lat is None or lng is None:
                continue

            t = rd.get("datetime")
            if t:
                try:
                    if datetime.fromisoformat(t) < cutoff:
                        continue
                except ValueError:
                    pass  # unparseable timestamp: keep the strike to be safe

            strikes.append({
                "type": rd.get("type"),  # "G" = cloud-to-ground, "C" = cloud-to-cloud
                "lat": float(lat),
                "lng": float(lng),
                "time": t,
            })

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "strike_count": len(strikes),
        "strikes": strikes,
    }