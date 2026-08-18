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
]

if __name__ == "__main__":
    for s in SPOTS:
        print(s)
