import httpx
from core.config import settings
from datetime import datetime

NEA_BASE = settings.NEA_BASE_URL


async def get_wind_speed() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{NEA_BASE}/wind-speed")
        r.raise_for_status()
        data = r.json()
    readings = data.get("data", {}).get("readings", [])
    stations = {s["id"]: s for s in data.get("data", {}).get("stations", [])}
    return {
        "timestamp": data.get("data", {}).get("readingTime"),
        "readings": [
            {
                "station_id": r["stationId"],
                "station_name": stations.get(r["stationId"], {}).get("name", r["stationId"]),
                "value_kmh": round(r["value"] * 3.6, 1),  # m/s → km/h
                "lat": stations.get(r["stationId"], {}).get("location", {}).get("latitude"),
                "lng": stations.get(r["stationId"], {}).get("location", {}).get("longitude"),
            }
            for r in readings
        ],
    }


async def get_wind_direction() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{NEA_BASE}/wind-direction")
        r.raise_for_status()
        data = r.json()
    readings = data.get("data", {}).get("readings", [])
    stations = {s["id"]: s for s in data.get("data", {}).get("stations", [])}
    return {
        "timestamp": data.get("data", {}).get("readingTime"),
        "readings": [
            {
                "station_id": r["stationId"],
                "station_name": stations.get(r["stationId"], {}).get("name", r["stationId"]),
                "degrees": r["value"],
                "cardinal": degrees_to_cardinal(r["value"]),
            }
            for r in readings
        ],
    }


async def get_temperature() -> dict:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{NEA_BASE}/air-temperature")
        r.raise_for_status()
        data = r.json()
    readings = data.get("data", {}).get("readings", [])
    stations = {s["id"]: s for s in data.get("data", {}).get("stations", [])}
    return {
        "readings": [
            {
                "station_id": r["stationId"],
                "station_name": stations.get(r["stationId"], {}).get("name", r["stationId"]),
                "celsius": r["value"],
            }
            for r in readings
        ]
    }


async def get_lightning() -> dict:
    """
    Dataset: d_08238953fe0f6dd13f10714ebfbcb9f9
    Returns cloud-to-ground (G) and cloud-to-cloud (C) strikes with lat/lng.
    Updated every 2 minutes. Expect 3-5 min transmission delay.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://api-open.data.gov.sg/v2/real-time/api/lightning-observation"
        )
        r.raise_for_status()
        data = r.json()
    strikes = data.get("data", {}).get("lightning", [])
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "strike_count": len(strikes),
        "strikes": [
            {
                "type": s.get("type"),   # "G" = cloud-to-ground, "C" = cloud-to-cloud
                "lat": s.get("latitude"),
                "lng": s.get("longitude"),
                "time": s.get("dateTime"),
            }
            for s in strikes
        ],
    }


def degrees_to_cardinal(deg: float) -> str:
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE",
            "S","SSW","SW","WSW","W","WNW","NW","NNW"]
    return dirs[round(deg / 22.5) % 16]
