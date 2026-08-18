from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/watersportskaki"
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:8081"]
    NEA_BASE_URL: str = "https://api-open.data.gov.sg/v2/real-time/api"
    CHECKIN_RADIUS_METRES: int = 300

    class Config:
        env_file = ".env"

settings = Settings()
