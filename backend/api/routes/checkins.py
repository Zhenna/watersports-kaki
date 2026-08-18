from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.checkin import find_nearest_spot

router = APIRouter()

# TODO: replace with DB query
SPOTS_PLACEHOLDER = [
    {"id": "ecp-e5",   "name": "East Coast Parkway (E5)", "lat": 1.3021, "lng": 103.9130, "sports": ["windsurf","sup","kayak"]},
    {"id": "ski360",   "name": "Ski360 Cable Park",        "lat": 1.3081, "lng": 103.9196, "sports": ["wakeboard","wakesurf"]},
    {"id": "sembawang","name": "Sembawang Park",            "lat": 1.4558, "lng": 103.8228, "sports": ["sup","kayak","windsurf"]},
    {"id": "pasir-ris","name": "Pasir Ris Park",            "lat": 1.3814, "lng": 103.9474, "sports": ["sup","kayak"]},
    {"id": "marina",   "name": "Marina Barrage",            "lat": 1.2804, "lng": 103.8706, "sports": ["sup","kayak","windsurf"]},
    {"id": "bedok-res","name": "Bedok Reservoir",           "lat": 1.3399, "lng": 103.9325, "sports": ["sup","kayak"]},
]


class CheckinRequest(BaseModel):
    user_id: str
    sport: str
    lat: float
    lng: float


@router.post("/")
def create_checkin(req: CheckinRequest):
    nearest = find_nearest_spot(req.lat, req.lng, SPOTS_PLACEHOLDER)
    if not nearest:
        raise HTTPException(
            status_code=400,
            detail="Not within 300m of a known watersports spot. Move closer and try again.",
        )
    if req.sport not in nearest.get("sports", []):
        raise HTTPException(
            status_code=400,
            detail=f"{nearest['name']} doesn't support {req.sport}. Supported: {nearest['sports']}",
        )
    # TODO: write to DB — {user_id, spot_id, sport, gps_lat, gps_lng, timestamp}
    return {
        "status": "checked_in",
        "spot": nearest["name"],
        "sport": req.sport,
        "distance_metres": nearest["distance_metres"],
    }


@router.get("/user/{user_id}")
def user_checkins(user_id: str):
    # TODO: pull from DB, return check-in history with per-sport counts
    return {"user_id": user_id, "checkins": []}
