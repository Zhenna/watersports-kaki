import uuid
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .base import Base


class ActivityCategoryStats(Base):
    """
    Demand threshold tracker per sport category.
    Drives demand-based pricing — paid tiers only unlock when
    active users in a category cross the threshold.

    active_users = users with this sport + community_matching_on
                   + at least 1 checkin in last 90 days.
    Refreshed nightly.
    """
    __tablename__ = "activity_category_stats"

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport                  = Column(String(30), nullable=False, unique=True, index=True)
    indicated_count        = Column(Integer, nullable=False, default=0)  # users with sport in profile
    active_participant_count = Column(Integer, nullable=False, default=0)  # verified checkins 90 days
    # Configurable thresholds — change without migration
    coach_threshold        = Column(Integer, nullable=False, default=500)
    business_threshold     = Column(Integer, nullable=False, default=1000)
    # Computed — active_participant_count >= threshold
    coach_paid_active      = Column(Boolean, nullable=False, default=False)
    business_paid_active   = Column(Boolean, nullable=False, default=False)
    # Month-over-month growth for trend display
    indicated_growth_pct   = Column(Integer, nullable=True)   # e.g. 12 = +12%
    participant_growth_pct = Column(Integer, nullable=True)
    updated_at             = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ActivityCategoryStats {self.sport} participants={self.active_participant_count}>"


class PlatformStats(Base):
    """
    Global weekly snapshot — shown on user portal dashboard.
    Pre-aggregated to avoid expensive real-time queries.
    Refreshed weekly.
    """
    __tablename__ = "platform_stats"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_start            = Column(DateTime(timezone=True), nullable=False, unique=True)
    total_active_users    = Column(Integer, nullable=False, default=0)
    activities_this_week  = Column(Integer, nullable=False, default=0)
    new_groups_formed     = Column(Integer, nullable=False, default=0)
    mutual_matches_revealed = Column(Integer, nullable=False, default=0)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<PlatformStats week={self.week_start} users={self.total_active_users}>"


class UserSportStats(Base):
    """
    Per-user per-sport aggregation — shown on user portal.
    Personalised: how many people share your sport, level, spots.
    Refreshed nightly.
    Never exposes individual profiles — counts only.
    """
    __tablename__ = "user_sport_stats"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id            = Column(UUID(as_uuid=True), nullable=False, index=True)
    sport              = Column(String(30), nullable=False)
    interested_count   = Column(Integer, nullable=False, default=0)  # total users interested in sport
    participant_count  = Column(Integer, nullable=False, default=0)  # verified checkins 90 days
    same_level_count   = Column(Integer, nullable=False, default=0)  # same level as user
    same_spot_count    = Column(Integer, nullable=False, default=0)  # active at user's usual spots
    age_group_count    = Column(Integer, nullable=False, default=0)  # same age band as user
    updated_at         = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<UserSportStats user={self.user_id} sport={self.sport}>"


class UserDatingSignals(Base):
    """
    PRIVATE — only accessible by the authenticated user themselves.
    Never returned in any public API endpoint.
    Never shows counts below 5 (show '<5' instead) to prevent
    reverse-engineering individual identities.
    Refreshed on a delay — not real-time, prevents timing attacks.

    Drives the cross-sport discovery panel:
    "8 people matching your criteria are active in diving at Lazarus Island"
    → user taps "I'm interested in diving"
    → organic path to meeting compatible people in a new sport
    """
    __tablename__ = "user_dating_signals"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id               = Column(UUID(as_uuid=True), nullable=False, index=True)
    sport                 = Column(String(30), nullable=False)
    # Count of users meeting dating criteria active in this sport
    # Stored as -1 if below minimum display threshold (5)
    matching_criteria_count = Column(Integer, nullable=False, default=0)
    # Where and when matches are most active — spot level only, never spot+time+age combined
    most_active_spot      = Column(Text, nullable=True)
    most_active_time_slot = Column(String(30), nullable=True)
    # Breakdown by sport for the cross-sport discovery panel (JSONB)
    # {"diving": {"count": 8, "spot": "Lazarus Island", "time": "weekend_morning"}, ...}
    cross_sport_signals   = Column(JSONB, nullable=True)
    updated_at            = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<UserDatingSignals user={self.user_id} sport={self.sport}>"


class BusinessDemandStats(Base):
    """
    Per-sport demand intelligence for business portal.
    Tiered access — free sees indicated count only,
    Starter unlocks participant count + spots,
    Pro unlocks skill/time breakdown + trends.
    Refreshed nightly.
    """
    __tablename__ = "business_demand_stats"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport                 = Column(String(30), nullable=False, index=True)
    spot_id               = Column(UUID(as_uuid=True), nullable=True, index=True)  # null = all SG
    indicated_count       = Column(Integer, nullable=False, default=0)
    participant_count     = Column(Integer, nullable=False, default=0)
    # JSONB breakdowns — only returned to Pro tier
    skill_breakdown       = Column(JSONB, nullable=True)  # {"beginner": 52, "intermediate": 33, ...}
    time_breakdown        = Column(JSONB, nullable=True)  # {"weekend_morning": 61, ...}
    indicated_growth_pct  = Column(Integer, nullable=True)
    participant_growth_pct = Column(Integer, nullable=True)
    updated_at            = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<BusinessDemandStats sport={self.sport}>"
