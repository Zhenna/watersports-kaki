import uuid
from sqlalchemy import (Column, String, Float, Text, Integer, Boolean, BigInteger, DateTime,
                        ForeignKey, UniqueConstraint, CheckConstraint, func, text)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class ActivityConditionRule(Base):
    """
    Reference range for one activity at one skill level. Replaces the WIND_RANGES dict
    in services/verdict.py. A missing rule for a wind-dependent activity means
    "unavailable", never "fine". Rules without reviewed_by are unreviewed and must not
    be published as guidance.
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
    rule_version   = Column(String(30), nullable=True)
    reviewed_by    = Column(String(100), nullable=True)
    reviewed_at    = Column(DateTime(timezone=True), nullable=True)
    source_note    = Column(Text, nullable=True)

    activity = relationship("Activity")


class SpotWindSector(Base):
    """
    Instructor-reviewed mapping of wind direction (bearing the wind blows FROM) to
    onshore, cross_shore or offshore at one spot. The sector runs clockwise from
    from_deg to to_deg and may wrap through north.
    """
    __tablename__ = "spot_wind_sectors"
    __table_args__ = (
        CheckConstraint("from_deg between 0 and 360", name="ck_spot_wind_sectors_from"),
        CheckConstraint("to_deg between 0 and 360", name="ck_spot_wind_sectors_to"),
        CheckConstraint("direction_class in ('onshore', 'cross_shore', 'offshore')",
                        name="ck_spot_wind_sectors_class"),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                             server_default=text("gen_random_uuid()"))
    spot_id         = Column(UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    activity_id     = Column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"),
                             nullable=True)
    from_deg        = Column(Float, nullable=False)
    to_deg          = Column(Float, nullable=False)
    direction_class = Column(String(20), nullable=False)
    note            = Column(Text, nullable=True)
    reviewed_by     = Column(String(100), nullable=True)
    reviewed_at     = Column(DateTime(timezone=True), nullable=True)


class SpotLaunchPoint(Base):
    """
    Where people launch for a shore-based sport at a spot, and the shoreline there.
    Optional: a spot with no launch point behaves exactly as before. Bearings are compass
    degrees. shore_bearing_deg is the direction the shoreline runs along. sea_bearing_deg is
    the direction you face to look at the sea, so the two are about 90 degrees apart.
    activity_id empty means every activity at the spot. Rows without reviewed_by are
    unreviewed and are shown only when provisional guidance is on, labelled as draft.
    """
    __tablename__ = "spot_launch_points"
    __table_args__ = (
        CheckConstraint("shore_bearing_deg between 0 and 360", name="ck_spot_launch_points_shore"),
        CheckConstraint("sea_bearing_deg between 0 and 360", name="ck_spot_launch_points_sea"),
        CheckConstraint("lat between -90 and 90 and lng between -180 and 180",
                        name="ck_spot_launch_points_coords"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                               server_default=text("gen_random_uuid()"))
    spot_id           = Column(UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    activity_id       = Column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"),
                               nullable=True)
    name              = Column(String(120), nullable=False)
    lat               = Column(Float, nullable=False)
    lng               = Column(Float, nullable=False)
    shore_bearing_deg = Column(Float, nullable=False)
    sea_bearing_deg   = Column(Float, nullable=False)
    note              = Column(Text, nullable=True)
    reviewed_by       = Column(String(100), nullable=True)
    reviewed_at       = Column(DateTime(timezone=True), nullable=True)


class WeatherStation(Base):
    __tablename__ = "weather_stations"
    __table_args__ = (UniqueConstraint("source", "station_id", name="uq_weather_station"),)

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                        server_default=text("gen_random_uuid()"))
    source     = Column(String(20), nullable=False, default="nea", server_default="nea")
    station_id = Column(String(30), nullable=False)
    name       = Column(String(100), nullable=True)
    lat        = Column(Float, nullable=True)
    lng        = Column(Float, nullable=True)


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


class ConditionForecast(Base):
    """
    A forecast value saved with its issue time and valid time, so forecast error can be
    evaluated against later observations.
    """
    __tablename__ = "condition_forecasts"
    __table_args__ = (
        UniqueConstraint("source", "provider_model", "spot_id", "issued_at", "valid_at",
                         "condition_type", name="uq_condition_forecast"),
    )

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    source         = Column(String(30), nullable=False)
    provider_model = Column(String(50), nullable=True)
    spot_id        = Column(UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"),
                            nullable=False)
    issued_at      = Column(DateTime(timezone=True), nullable=False)
    valid_at       = Column(DateTime(timezone=True), nullable=False)
    condition_type = Column(String(30), nullable=False)
    value          = Column(Float, nullable=False)
    unit           = Column(String(20), nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())


class FeedFetchLog(Base):
    """One row per fetch attempt. Used to compute 'last successful update' and feed health."""
    __tablename__ = "feed_fetch_log"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    source      = Column(String(30), nullable=False)
    feed        = Column(String(40), nullable=False)
    started_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ok          = Column(Boolean, nullable=False)
    http_status = Column(Integer, nullable=True)
    error       = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
