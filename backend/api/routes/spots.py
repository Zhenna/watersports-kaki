from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def list_spots():
    # TODO: pull from DB
    return {
        "spots": [
            {"id": "ecp-e5",    "name": "East Coast Parkway (E5)", "sports": ["windsurf","sup","kayak"]},
            {"id": "ski360",    "name": "Ski360 Cable Park",        "sports": ["wakeboard","wakesurf"]},
            {"id": "sembawang", "name": "Sembawang Park",           "sports": ["sup","kayak","windsurf"]},
            {"id": "pasir-ris", "name": "Pasir Ris Park",           "sports": ["sup","kayak"]},
            {"id": "marina",    "name": "Marina Barrage",           "sports": ["sup","kayak","windsurf"]},
            {"id": "bedok-res", "name": "Bedok Reservoir",          "sports": ["sup","kayak"]},
        ]
    }
