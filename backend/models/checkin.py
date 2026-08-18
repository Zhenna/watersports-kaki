import uuid
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Checkin(Base):
    __tablename__ = "checkins"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    spot_id       = Column(UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"), nullable=False, index=True)
    sport         = Column(String(30), nullable=False)
    gps_lat       = Column(Float, nullable=False)
    gps_lng       = Column(Float, nullable=False)
    checked_in_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    user = relationship("User", back_populates="checkins")
    spot = relationship("Spot", back_populates="checkins")

    def __repr__(self):
        return f"<Checkin user={self.user_id} sport={self.sport}>"