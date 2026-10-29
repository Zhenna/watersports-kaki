import uuid
from sqlalchemy import (Column, String, Boolean, DateTime, ForeignKey, Table,
                        UniqueConstraint, CheckConstraint, func, text)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from .base import Base

# Link tables. Referenced from Spot / Operator via secondary="spot_activities" etc.
spot_activities = Table(
    "spot_activities", Base.metadata,
    Column("spot_id", UUID(as_uuid=True), ForeignKey("spots.id", ondelete="CASCADE"),
           primary_key=True),
    Column("activity_id", UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"),
           primary_key=True),
)

operator_activities = Table(
    "operator_activities", Base.metadata,
    Column("operator_id", UUID(as_uuid=True), ForeignKey("operators.id", ondelete="CASCADE"),
           primary_key=True),
    Column("activity_id", UUID(as_uuid=True), ForeignKey("activities.id", ondelete="CASCADE"),
           primary_key=True),
)


class Activity(Base):
    """
    One row per activity (windsurf, sup, hiking later). Activity is data, not schema.
    slug is a permanent identifier: never rename it, milestones and rules refer to it.
    config holds activity-specific flags, e.g. {"wind_dependent": true}.
    """
    __tablename__ = "activities"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                        server_default=text("gen_random_uuid()"))
    slug       = Column(String(30), nullable=False, unique=True)
    name       = Column(String(100), nullable=False)
    category   = Column(String(20), nullable=False, default="water", server_default="water")
    config     = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    is_active  = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Activity {self.slug}>"


class UserActivityProfile(Base):
    """A user's relationship to one activity: doing or want to try, plus level."""
    __tablename__ = "user_activity_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_user_activity_profile"),
        CheckConstraint("status in ('doing', 'want_to_try')",
                        name="ck_user_activity_profiles_status"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                         server_default=text("gen_random_uuid()"))
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    activity_id = Column(UUID(as_uuid=True), ForeignKey("activities.id", ondelete="RESTRICT"),
                         nullable=False)
    # doing | want_to_try
    status      = Column(String(20), nullable=False, default="doing", server_default="doing")
    # never_tried | beginner | intermediate | advanced
    level       = Column(String(20), nullable=True)
    extra       = Column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(),
                         onupdate=func.now())

    user     = relationship("User", back_populates="activity_profiles")
    activity = relationship("Activity")

    def __repr__(self):
        return f"<UserActivityProfile user={self.user_id} activity={self.activity_id}>"
