from fastapi import APIRouter
from services.nea import get_wind_speed, get_wind_direction, get_temperature, get_lightning

router = APIRouter()

# Raw NEA feeds. The interpreted conditions endpoint is GET /api/spots/{slug}/conditions,
# which uses services/conditions_rules.py. The old /conditions verdict endpoint was removed
# because it turned a missing wind reading into zero and used absolute safety wording.


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
