import uuid
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

"""
Dating layer — PRIVATE MODULE.

Hard product rules:
  - Nobody knows who is open to dating until there is a mutual romantic match
  - One-sided interest is permanently private
  - Operators never receive individual dating information
  - Other participants see only aggregate counts, never individual status
  - Paid users cannot identify who is single before a mutual match
  - Nobody can purchase privileged access to a particular person

Access:
  - DatingProfile    → authenticated user only (their own)
  - DatingInterest   → WSK dating engine only, never exposed via API
  - MutualMatch      → both matched users only, after mutual interest confirmed

Free tier: ~3 mutual match unlocks (FREE_MATCH_ALLOWANCE, configurable)
Paid (Dating+): unlimited matches, proactive alerts, better compatibility
"""

FREE_MATCH_ALLOWANCE = 3   # configurable — validate with real users before changing


class DatingProfile(Base):
    """
    Completely private — never joined to public user queries.
    Exists only if user has opted into dating mode.
    """
    __tablename__ = "dating_profiles"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id             = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                                 unique=True, nullable=False)
    is_dating_active    = Column(Boolean, nullable=False, default=False)
    # Private dating preferences
    interested_in       = Column(String(50), nullable=True)    # free text — not an enum
    age_pref_min        = Column(Integer, nullable=True)
    age_pref_max        = Column(Integer, nullable=True)
    # Paid tier
    is_dating_plus      = Column(Boolean, nullable=False, default=False)
    dating_plus_until   = Column(DateTime(timezone=True), nullable=True)
    # Free tier match counter
    free_matches_used   = Column(Integer, nullable=False, default=0)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    user      = relationship("User", back_populates="dating_profile")
    interests = relationship("DatingInterest", foreign_keys="DatingInterest.from_user_id",
                             back_populates="from_profile", lazy="dynamic")
    matches   = relationship("MutualMatch",
                             primaryjoin="or_(MutualMatch.user_a_id==DatingProfile.user_id, "
                                         "MutualMatch.user_b_id==DatingProfile.user_id)",
                             foreign_keys="[MutualMatch.user_a_id, MutualMatch.user_b_id]",
                             lazy="dynamic")

    @property
    def can_unlock_match(self) -> bool:
        from datetime import datetime, timezone
        if self.is_dating_plus and self.dating_plus_until > datetime.now(timezone.utc):
            return True
        return self.free_matches_used < FREE_MATCH_ALLOWANCE

    def __repr__(self):
        return f"<DatingProfile user={self.user_id} active={self.is_dating_active}>"


class DatingInterest(Base):
    """
    Private romantic interest expressed after a session.
    Only eligible users who opted in can express interest.
    Interest can only be expressed toward someone in the same completed session.
    One-sided interest is NEVER revealed — only mutual matches surface.
    """
    __tablename__ = "dating_interests"
    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", "session_id",
                         name="uq_dating_interest"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    to_user_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    # Must be a completed session both users attended
    session_id  = Column(UUID(as_uuid=True), ForeignKey("group_sessions.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    from_profile = relationship("DatingProfile", foreign_keys=[from_user_id],
                                back_populates="interests")

    def __repr__(self):
        return f"<DatingInterest {self.from_user_id} → {self.to_user_id}>"


class MutualMatch(Base):
    """
    Created by the dating engine when A likes B AND B likes A.
    Both users are notified. One-sided interests are never surfaced.
    Consumes one free match allowance for each user (or Dating+ quota).
    """
    __tablename__ = "mutual_matches"
    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_mutual_match"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_a_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    user_b_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("group_sessions.id", ondelete="CASCADE"),
                         nullable=False)
    # "active" | "expired" (if neither contacts within window)
    status      = Column(String(20), nullable=False, default="active")
    revealed_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at  = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<MutualMatch {self.user_a_id} ↔ {self.user_b_id}>"
