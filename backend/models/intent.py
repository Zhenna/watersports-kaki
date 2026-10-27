import uuid
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Date, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Intent(Base):
    """
    Low-commitment "I'm interested" signal from a user.
    Does not book or commit — just registers demand.

    Feeds:
      - demand aggregation for businesses
      - group matching algorithm
      - user portal stats (how many interested in my sport)
      - cross-sport discovery (where matches are active)

    Example:
      User taps "I'm interested in beginner wakesurfing"
      Optional constraints: date window, budget, spot preference
    """
    __tablename__ = "intents"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    sport          = Column(String(30), nullable=False, index=True)
    level          = Column(String(20), nullable=True)
    # Optional constraints
    preferred_spot = Column(Text, nullable=True)
    date_from      = Column(Date, nullable=True)
    date_to        = Column(Date, nullable=True)
    time_slot      = Column(String(30), nullable=True)
    budget_sgd     = Column(Integer, nullable=True)          # max budget in SGD
    # Group composition preference for this specific intent
    # "anyone" | "women_only" | "men_only" | "no_preference"
    group_gender_pref = Column(String(20), nullable=False, default="anyone")
    age_group_pref    = Column(String(20), nullable=True)    # from AGE_GROUPS
    # "active" | "matched" | "expired"
    status         = Column(String(20), nullable=False, default="active")
    is_active      = Column(Boolean, nullable=False, default=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    expires_at     = Column(DateTime(timezone=True), nullable=True)  # null = no expiry

    user = relationship("User", back_populates="intents")

    def __repr__(self):
        return f"<Intent user={self.user_id} sport={self.sport} [{self.status}]>"
