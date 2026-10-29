import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

# Water Days milestones
WATER_DAY_MILESTONES = [1, 5, 10, 25, 50, 100]

# Sports Unlocked milestones
SPORTS_MILESTONES = [1, 3, 5, 10]

# Kakis Met milestones
KAKIS_MILESTONES = [1, 5, 10, 25, 50, 100]


class WaterProfile(Base):
    """
    Persistent record of a user's watersports life.
    Three dimensions: Water Days, Sports Unlocked, Kakis Met.
    Updated after every verified session.
    """
    __tablename__ = "water_profiles"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                             unique=True, nullable=False)
    water_days      = Column(Integer, nullable=False, default=0)
    sports_unlocked = Column(Integer, nullable=False, default=0)
    kakis_met       = Column(Integer, nullable=False, default=0)
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(),
                             onupdate=func.now())

    user      = relationship("User", back_populates="water_profile")
    milestones = relationship("Milestone", back_populates="water_profile", lazy="dynamic")

    def __repr__(self):
        return (f"<WaterProfile user={self.user_id} "
                f"days={self.water_days} sports={self.sports_unlocked} "
                f"kakis={self.kakis_met}>")


class Milestone(Base):
    """
    Triggered when a user hits a meaningful threshold.
    Generates a shareable social asset.
    Design principle: help users brag about themselves, not advertise WSK.
    """
    __tablename__ = "milestones"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id          = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                              nullable=False, index=True)
    water_profile_id = Column(UUID(as_uuid=True), ForeignKey("water_profiles.id",
                              ondelete="CASCADE"), nullable=False)
    # e.g. "water_days_10" | "sports_unlocked_3" | "kakis_met_5" | "sport_unlocked_windsurf"
    milestone_type   = Column(String(50), nullable=False)
    milestone_label  = Column(String(100), nullable=True)  # human-readable, e.g. "10 Days on the Water"
    sport            = Column(String(30), nullable=True)    # set for sport_unlocked milestones
    activity_id      = Column(UUID(as_uuid=True), ForeignKey("activities.id",
                              ondelete="RESTRICT"), nullable=True, index=True)
    asset_url        = Column(Text, nullable=True)          # Supabase Storage URL for shareable image
    triggered_at     = Column(DateTime(timezone=True), server_default=func.now())
    shared_at        = Column(DateTime(timezone=True), nullable=True)

    user          = relationship("User", back_populates="milestones")
    water_profile = relationship("WaterProfile", back_populates="milestones")

    def __repr__(self):
        return f"<Milestone {self.milestone_type} user={self.user_id}>"
