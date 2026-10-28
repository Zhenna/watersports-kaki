import uuid
from datetime import date
from sqlalchemy import Column, String, Boolean, Date, DateTime, Text, ARRAY, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

SPORTS = ["windsurf", "sup", "kayak", "wakesurf", "wakeboard", "diving", "kitesurfing", "other"]
LEVELS = ["beginner", "intermediate", "advanced"]


class User(Base):
    __tablename__ = "users"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone            = Column(String(20), unique=True, nullable=False, index=True)
    display_name     = Column(String(50), nullable=False)
    date_of_birth    = Column(Date, nullable=True)
    gender           = Column(String(50), nullable=True)
    sports_doing     = Column(ARRAY(Text), nullable=False, default=[])
    sports_want_try  = Column(ARRAY(Text), nullable=False, default=[])
    levels           = Column(ARRAY(Text), nullable=False, default=[])
    preferred_spots  = Column(ARRAY(Text), nullable=False, default=[])
    preferred_times  = Column(ARRAY(Text), nullable=False, default=[])
    is_active        = Column(Boolean, nullable=False, default=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    last_seen        = Column(DateTime(timezone=True), nullable=True)

    checkins         = relationship("Checkin", back_populates="user", lazy="dynamic")
    intents          = relationship("Intent", back_populates="user", lazy="dynamic")
    sessions_led     = relationship("ActivitySession",
                                    foreign_keys="ActivitySession.kaki_leader_id",
                                    back_populates="kaki_leader", lazy="dynamic")
    session_members  = relationship("SessionMember", back_populates="user", lazy="dynamic")
    water_profile    = relationship("WaterProfile", back_populates="user", uselist=False)
    milestones       = relationship("Milestone", back_populates="user", lazy="dynamic")

    @property
    def age(self) -> int | None:
        if not self.date_of_birth:
            return None
        today = date.today()
        return (
            today.year - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    def __repr__(self):
        return f"<User {self.display_name}>"
