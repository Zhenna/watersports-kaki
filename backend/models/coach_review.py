import uuid
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class CoachReview(Base):
    """
    Session-verified review — only triggered after a confirmed session completes
    AND a coach is in the group. Review link sent via system message in group chat.
    No anonymous reviews. Every review is traceable to a real verified session.
    """
    __tablename__ = "coach_reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("group_sessions.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    coach_id    = Column(UUID(as_uuid=True), ForeignKey("private_coach_profiles.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    rating      = Column(Integer, nullable=False)   # 1–5, enforced by DB constraint
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("GroupSession", back_populates="reviews")
    coach   = relationship("PrivateCoachProfile", back_populates="reviews")

    def __repr__(self):
        return f"<CoachReview coach={self.coach_id} rating={self.rating}>"
