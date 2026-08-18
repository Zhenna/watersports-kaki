from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import weather, users, checkins, spots
from core.config import settings

app = FastAPI(
    title="Watersports Kaki API",
    description="Conditions checker and community backend for Singapore watersports",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(weather.router, prefix="/api/weather", tags=["weather"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(checkins.router, prefix="/api/checkins", tags=["checkins"])
app.include_router(spots.router, prefix="/api/spots", tags=["spots"])

@app.get("/")
def root():
    return {"status": "ok", "app": "Watersports Kaki"}
