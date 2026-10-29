import uuid
from sqlalchemy import (Column, String, Float, BigInteger, DateTime, ForeignKey,
                        UniqueConstraint, func, text)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class ActivityConditionRule(Base):
    """
    Interpretation of raw conditions for one activity at one skill level.
    Replaces the WIND_RANGES dict in services/verdict.py.
    A missing rule for a wind-dependent activity means "unknown", never "good".
    """
    __tablename__ = "activity_condition_rules"
    __table_args__ = (
        UniqueConstraint("activity_id", "level", "condition_type",
                         name="uq_activity_condition_rule"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                            server_default=text("gen_random_uuid()"))
    activity_id    = Column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"),
                            nullable=False)
    level          = Column(String(20), nullable=False)
    # e.g. wind_speed_kmh
    condition_type = Column(String(30), nullable=False)
    min_value      = Column(Float, nullable=True)
    max_value      = Column(Float, nullable=True)

    activity = relationship("Activity")


class ConditionObservation(Base):
    """
    Append-only raw readings (NEA etc.). History cannot be backfilled later,
    so start logging early. Store only stations mapped to spots.
    """
    __tablename__ = "condition_observations"
    __table_args__ = (
        UniqueConstraint("source", "station_id", "condition_type", "observed_at",
                         name="uq_condition_observation"),
    )

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    source         = Column(String(20), nullable=False, default="nea", server_default="nea")
    station_id     = Column(String(30), nullable=False)
    # wind_speed_kmh | wind_direction_deg | air_temp_c
    condition_type = Column(String(30), nullable=False)
    observed_at    = Column(DateTime(timezone=True), nullable=False)
    value          = Column(Float, nullable=False)
    unit           = Column(String(20), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
