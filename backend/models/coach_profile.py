import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text, ARRAY, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class CoachProfile(Base):
    __tablename__ = "coach_profiles"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    bio            = Column(Text, nullable=True)
    certifications = Column(ARRAY(Text), nullable=False, default=[])
    sports         = Column(ARRAY(Text), nullable=False, default=[])
    # Payment gate — coach features only active when is_paid=True and paid_until > now
    is_paid        = Column(Boolean, nullable=False, default=False)
    paid_until     = Column(DateTime(timezone=True), nullable=True)
    # Media counts — actual files stored in object storage (e.g. Supabase Storage)
    photo_count    = Column(Integer, nullable=False, default=0)
    video_count    = Column(Integer, nullable=False, default=0)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    user    = relationship("User", back_populates="coach_profile")
    reviews = relationship("CoachReview", back_populates="coach", lazy="dynamic")

    @property
    def is_active_coach(self) -> bool:
        from datetime import datetime, timezone
        return self.is_paid and self.paid_until and self.paid_until > datetime.now(timezone.utc)

    def __repr__(self):
        return f"<CoachProfile user={self.user_id} paid={self.is_paid}>"
