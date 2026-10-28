SPOTS = [
    {
        "name": "East Coast Parkway (Carpark E5)",
        "lat": 1.3021,
        "lng": 103.9130,
        "radius_metres": 300,
        "sports": ["windsurf", "sup", "kayak"],
        "nea_station_id": "S107",
    },
    {
        "name": "Ski360 Cable Park",
        "lat": 1.3081,
        "lng": 103.9196,
        "radius_metres": 200,
        "sports": ["wakeboard", "wakesurf"],
        "nea_station_id": "S107",
    },
    {
        "name": "Sembawang Park",
        "lat": 1.4558,
        "lng": 103.8228,
        "radius_metres": 300,
        "sports": ["sup", "kayak", "windsurf"],
        "nea_station_id": "S111",
    },
    {
        "name": "Pasir Ris Park",
        "lat": 1.3814,
        "lng": 103.9474,
        "radius_metres": 300,
        "sports": ["sup", "kayak"],
        "nea_station_id": "S24",
    },
    {
        "name": "Marina Barrage",
        "lat": 1.2804,
        "lng": 103.8706,
        "radius_metres": 250,
        "sports": ["sup", "kayak", "windsurf"],
        "nea_station_id": "S60",
    },
    {
        "name": "Bedok Reservoir",
        "lat": 1.3399,
        "lng": 103.9325,
        "radius_metres": 300,
        "sports": ["sup", "kayak"],
        "nea_station_id": "S107",
    },
    {
        "name": "Lazarus Island",
        "lat": 1.2264,
        "lng": 103.8611,
        "radius_metres": 400,
        "sports": ["diving", "sup", "kayak"],
        "nea_station_id": "S60",
    },
    {
        "name": "Sisters' Islands",
        "lat": 1.2069,
        "lng": 103.8464,
        "radius_metres": 400,
        "sports": ["diving"],
        "nea_station_id": "S60",
    },
    {
        "name": "Pulau Hantu",
        "lat": 1.2261,
        "lng": 103.7458,
        "radius_metres": 400,
        "sports": ["diving"],
        "nea_station_id": "S60",
    },
    {
        "name": "St John's Island",
        "lat": 1.2256,
        "lng": 103.8453,
        "radius_metres": 400,
        "sports": ["diving", "sup", "kayak"],
        "nea_station_id": "S60",
    },
]

if __name__ == "__main__":
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from core.config import settings
    from models.spot import Spot

    engine = create_engine(settings.DATABASE_URL)
    with Session(engine) as session:
        for s in SPOTS:
            existing = session.scalar(select(Spot).where(Spot.name == s["name"]))
            if existing:
                for k, v in s.items():
                    setattr(existing, k, v)
                print(f"updated  {s['name']}")
            else:
                session.add(Spot(**s))
                print(f"inserted {s['name']}")
        session.commit()