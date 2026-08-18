from fastapi import APIRouter

router = APIRouter()


@router.get("/{user_id}/profile")
def get_profile(user_id: str):
    # TODO: return user profile with check-in counts, sports, usual spots
    return {"user_id": user_id, "status": "stub — connect to DB"}


@router.get("/discover")
def discover(sport: str = None, level: str = None, spot_id: str = None):
    # TODO: query users by sport/level/usual spot for community discovery
    return {"users": [], "filters": {"sport": sport, "level": level, "spot_id": spot_id}}
