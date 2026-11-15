import uuid
from sqlalchemy import Column, String, Float, Integer, Text, Boolean, ARRAY, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Spot(Base):
    __tablename__ = "spots"
    __table_args__ = (
        CheckConstraint(
            "forecast_region IS NULL OR forecast_region IN ('north', 'south', 'east', 'west', 'central')",
            name="ck_spots_forecast_region",
        ),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name           = Column(String(100), nullable=False)
    lat            = Column(Float, nullable=False)
    lng            = Column(Float, nullable=False)
    radius_metres  = Column(Integer, nullable=False, default=300)
    # Legacy array: replaced by spot_activities, dropped in the contract step.
    sports         = Column(ARRAY(Text), nullable=False, default=[])
    nea_station_id = Column(String(20), nullable=True)
    forecast_region = Column(String(20), nullable=True)
    slug           = Column(String(60), unique=True, nullable=True)
    description    = Column(Text, nullable=True)
    caveats        = Column(Text, nullable=True)
    is_public      = Column(Boolean, nullable=False, default=False,
                            server_default=text("false"))

    checkins   = relationship("Checkin", back_populates="spot", lazy="dynamic")
    activities = relationship("Activity", secondary="spot_activities", lazy="selectin")
    wind_sectors = relationship("SpotWindSector", lazy="selectin")
    launch_points = relationship("SpotLaunchPoint", lazy="selectin")

    def __repr__(self):
        return f"<Spot {self.name}>"
