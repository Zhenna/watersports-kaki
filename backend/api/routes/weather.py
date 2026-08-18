from fastapi import APIRouter, Query
from math import sqrt
from typing import Optional
from services.nea import get_wind_speed, get_wind_direction, get_temperature, get_lightning
from services.verdict import get_verdict, Sport, Level

router = APIRouter()


@router.get("/conditions")
async def conditions(
    sport: Sport = Query(...),
    level: Level = Query(...),
    lat: Optional[float] = Query(None, description="User latitude"),
    lng: Optional[float] = Query(None, description="User longitude"),
):
    """
    Main endpoint for the app's condition verdict.
    Pass sport + level + user coords → get a go/no-go verdict with reason.
    """
    wind_data = await get_wind_speed()
    lightning_data = await get_lightning()

    # Nearest wind station to user
    wind_kmh = None
    if lat and lng and wind_data["readings"]:
        def dist(r):
            if r["lat"] and r["lng"]:
                return (r["lat"] - lat) ** 2 + (r["lng"] - lng) ** 2
            return float("inf")
        nearest_station = min(wind_data["readings"], key=dist)
        wind_kmh = nearest_station["value_kmh"]
    elif wind_data["readings"]:
        wind_kmh = wind_data["readings"][0]["value_kmh"]

    # Nearest lightning strike
    nearest_lightning_km = None
    if lat and lng and lightning_data["strikes"]:
        def strike_km(s):
            if s["lat"] and s["lng"]:
                dlat = (s["lat"] - lat) * 111
                dlng = (s["lng"] - lng) * 111 * 0.9175
                return sqrt(dlat ** 2 + dlng ** 2)
            return float("inf")
        nearest_lightning_km = min(strike_km(s) for s in lightning_data["strikes"])

    verdict = get_verdict(sport, level, wind_kmh or 0, nearest_lightning_km)

    return {
        "sport": sport,
        "level": level,
        "wind_kmh": wind_kmh,
        "lightning": {
            "strike_count": lightning_data["strike_count"],
            "nearest_km": round(nearest_lightning_km, 1) if nearest_lightning_km else None,
        },
        "verdict": verdict,
        "wind_timestamp": wind_data.get("timestamp"),
    }


@router.get("/wind")
async def wind():
    return await get_wind_speed()


@router.get("/wind-direction")
async def wind_direction():
    return await get_wind_direction()


@router.get("/lightning")
async def lightning():
    return await get_lightning()


@router.get("/temperature")
async def temperature():
    return await get_temperature()
