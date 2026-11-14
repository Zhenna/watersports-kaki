"""Fetchers for NEA's forecast feeds. Same base address as the observation feeds in services/nea.py."""
import httpx

from core.config import settings

NEA_BASE = settings.NEA_BASE_URL


async def _get(endpoint: str) -> dict:
    # Forecasts are small but the connection can be slow, so allow longer than the default.
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{NEA_BASE}/{endpoint}")
        r.raise_for_status()
        return r.json()


async def get_four_day_outlook() -> dict:
    return await _get("four-day-outlook")


async def get_24h_forecast() -> dict:
    return await _get("twenty-four-hr-forecast")
