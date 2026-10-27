import uuid
from datetime import date
from sqlalchemy import Column, String, Boolean, Date, DateTime, Text, ARRAY, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

# Broad age bands — intentionally overlapping to avoid fragmenting liquidity
AGE_GROUPS = [
    "18+",
    "18-29",
    "25-39",
    "30-49",
    "40-59",
    "50+",
    "around_my_age",  # algorithm computes ±7 years
]

SPORTS = ["windsurf", "wakesurf", "wakeboard", "sup", "kayak", "diving"]
LEVELS = ["beginner", "intermediate", "advanced"]
TIME_SLOTS = ["weekday_morning", "weekday_afternoon", "weekday_evening",
              "weekend_morning", "weekend_afternoon", "weekend_evening"]


class User(Base):
    __tablename__ = "users"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone                 = Column(String(20), unique=True, nullable=False, index=True)
    display_name          = Column(String(50), nullable=False)

    # "user" | "private_coach" | "business" — unlocked by payment once demand threshold met
    user_type             = Column(String(20), nullable=False, default="user")

    # Personal info — all optional
    date_of_birth         = Column(Date, nullable=True)
    gender                = Column(String(50), nullable=True)   # free text

    # Activity profile
    sports                = Column(ARRAY(Text), nullable=False, default=[])
    levels                = Column(ARRAY(Text), nullable=False, default=[])  # parallel array to sports

    # Community matching preferences
    preferred_spots       = Column(ARRAY(Text), nullable=False, default=[])
    preferred_time_slots  = Column(ARRAY(Text), nullable=False, default=[])
    community_matching_on = Column(Boolean, nullable=False, default=False)

    # Group composition preferences — selectable per activity via group settings, not hardcoded here
    # Stored as JSON per sport: {"windsurf": "anyone", "diving": "women_only"}
    gender_pref_by_sport  = Column(Text, nullable=True)         # JSON string

    # Age group preference for activity matching — broad bands only
    age_group_pref        = Column(String(20), nullable=True)   # from AGE_GROUPS

    # Contact details — only shared via explicit ContactShare action after mutual follow
    contact_whatsapp      = Column(String(20), nullable=True)
    contact_instagram     = Column(String(50), nullable=True)
    contact_email         = Column(String(255), nullable=True)

    # Privacy settings
    show_checkin_date     = Column(Boolean, nullable=False, default=False)

    is_active             = Column(Boolean, nullable=False, default=True)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())
    last_seen             = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    checkins              = relationship("Checkin", back_populates="user", lazy="dynamic")
    sent_connections      = relationship("Connection", foreign_keys="Connection.from_user_id",
                                         back_populates="from_user", lazy="dynamic")
    received_connections  = relationship("Connection", foreign_keys="Connection.to_user_id",
                                         back_populates="to_user", lazy="dynamic")
    group_memberships     = relationship("GroupMember", back_populates="user", lazy="dynamic")
    intents               = relationship("Intent", back_populates="user", lazy="dynamic")
    private_coach_profile = relationship("PrivateCoachProfile", back_populates="user", uselist=False)
    business_profile      = relationship("BusinessProfile", back_populates="user", uselist=False)
    dating_profile        = relationship("DatingProfile", back_populates="user", uselist=False)
    contact_shares_sent   = relationship("ContactShare", foreign_keys="ContactShare.from_user_id",
                                         back_populates="from_user", lazy="dynamic")
    contact_shares_received = relationship("ContactShare", foreign_keys="ContactShare.to_user_id",
                                           back_populates="to_user", lazy="dynamic")

    @property
    def age(self) -> int | None:
        if not self.date_of_birth:
            return None
        today = date.today()
        return (
            today.year - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    @property
    def is_underage(self) -> bool:
        age = self.age
        return age is not None and age < 16

    def __repr__(self):
        return f"<User {self.display_name} ({self.user_type})>"
