import uuid
from sqlalchemy import Column, String, Float, Integer, Text, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Spot(Base):
    __tablename__ = "spots"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name           = Column(String(100), nullable=False)
    lat            = Column(Float, nullable=False)
    lng            = Column(Float, nullable=False)
    radius_metres  = Column(Integer, nullable=False, default=300)
    sports         = Column(ARRAY(Text), nullable=False, default=[])
    nea_station_id = Column(String(20), nullable=True)

    checkins = relationship("Checkin", back_populates="spot", lazy="dynamic")

    def __repr__(self):
        return f"<Spot {self.name}>"