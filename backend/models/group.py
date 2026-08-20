import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, ARRAY, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

# Max group size constants by sport
GROUP_MAX_SIZE = {
    "windsurf":  6,
    "wakesurf":  5,
    "wakeboard": 5,
    "sup":       6,
    "kayak":     6,
    "diving":    4,
}
GROUP_MIN_SIZE = 3
GROUP_EXPIRY_HOURS = 24  # configurable — group dissolves if no message within this window


class Group(Base):
    __tablename__ = "groups"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport      = Column(String(30), nullable=False, index=True)
    # Which dimensions the algorithm matched on — used to generate group description
    # e.g. ["sport", "level", "spot"] or ["sport", "level", "spot", "gender", "age"]
    matched_on = Column(ARRAY(Text), nullable=False, default=[])
    min_size   = Column(Integer, nullable=False, default=GROUP_MIN_SIZE)
    max_size   = Column(Integer, nullable=False, default=6)
    # "active" | "expired" | "permanent" (permanent once first message sent)
    status     = Column(String(20), nullable=False, default="active")
    formed_at  = Column(DateTime(timezone=True), server_default=func.now())
    # Set to formed_at + GROUP_EXPIRY_HOURS — nulled out when status becomes permanent
    expires_at = Column(DateTime(timezone=True), nullable=True)

    members       = relationship("GroupMember", back_populates="group", lazy="dynamic")
    sessions      = relationship("GroupSession", back_populates="group", lazy="dynamic")
    availabilities = relationship("SessionAvailability", back_populates="group", lazy="dynamic")
    messages      = relationship("Message", back_populates="group", lazy="dynamic")

    def __repr__(self):
        return f"<Group {self.sport} [{self.status}]>"
