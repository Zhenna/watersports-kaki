import asyncio
from math import radians, sin, cos, asin, sqrt
from seed_spots import SPOTS
from services.nea import get_wind_speed

def km(lat1, lng1, lat2, lng2):
    p = radians
    h = sin(p(lat2 - lat1) / 2) ** 2 + cos(p(lat1)) * cos(p(lat2)) * sin(p(lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))

async def main():
    data = await get_wind_speed()
    readings = [r for r in data["readings"] if r["lat"] and r["lng"]]
    for s in SPOTS:
        best = min(readings, key=lambda r: km(s["lat"], s["lng"], r["lat"], r["lng"]))
        d = km(s["lat"], s["lng"], best["lat"], best["lng"])
        print(f'{s["name"]:34} set={s["nea_station_id"]:5} nearest={best["station_id"]} {best["station_name"]} ({d:.1f} km)')

asyncio.run(main())