import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text, ARRAY, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class PrivateCoachProfile(Base):
    """
    Individual coach — teaches on their own, often part-time.
    Verified by certification upload.
    Paid tier unlocks when sport category crosses demand threshold.
    Priced lower than BusinessProfile — smaller scale.
    """
    __tablename__ = "private_coach_profiles"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                            unique=True, nullable=False)
    bio            = Column(Text, nullable=True)
    certifications = Column(ARRAY(Text), nullable=False, default=[])  # e.g. ["PADI OW", "IWS L1"]
    cert_doc_url   = Column(Text, nullable=True)    # Supabase Storage URL for cert upload
    sports         = Column(ARRAY(Text), nullable=False, default=[])
    rate_per_session_sgd = Column(Integer, nullable=True)  # their asking rate
    # Verification — cert uploaded + manually checked
    is_cert_uploaded = Column(Boolean, nullable=False, default=False)
    is_verified    = Column(Boolean, nullable=False, default=False)   # after manual review
    # Payment gate
    is_paid        = Column(Boolean, nullable=False, default=False)
    paid_until     = Column(DateTime(timezone=True), nullable=True)
    # Media
    photo_count    = Column(Integer, nullable=False, default=0)
    video_count    = Column(Integer, nullable=False, default=0)        # 100MB cap per video
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    user    = relationship("User", back_populates="private_coach_profile")
    reviews = relationship("CoachReview", back_populates="coach", lazy="dynamic")

    @property
    def is_active_coach(self) -> bool:
        return (
            self.is_paid
            and self.paid_until is not None
            and self.paid_until > datetime.now(timezone.utc)
        )

    def __repr__(self):
        return f"<PrivateCoachProfile user={self.user_id} verified={self.is_verified}>"


class BusinessProfile(Base):
    """
    Company — cable park, diving school, rental shop, event organiser.
    Verified by UEN lookup against ACRA public registry.
    Gets full demand intelligence, offer listing, B2B partner matching.
    Higher price tier than PrivateCoachProfile.
    """
    __tablename__ = "business_profiles"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                           unique=True, nullable=False)
    business_name = Column(String(100), nullable=False)
    # "operator" | "school" | "rental" | "event" | "other"
    business_type = Column(String(30), nullable=False)
    uen           = Column(String(20), nullable=True, unique=True)  # Singapore UEN
    is_uen_verified = Column(Boolean, nullable=False, default=False)  # auto-checked via ACRA
    sports        = Column(ARRAY(Text), nullable=False, default=[])
    description   = Column(Text, nullable=True)
    website       = Column(String(255), nullable=True)
    # Payment gate
    is_paid       = Column(Boolean, nullable=False, default=False)
    paid_until    = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="business_profile")

    @property
    def is_active_business(self) -> bool:
        from datetime import datetime, timezone
        return (
            self.is_paid
            and self.paid_until is not None
            and self.paid_until > datetime.now(timezone.utc)
        )

    def __repr__(self):
        return f"<BusinessProfile {self.business_name} uen_verified={self.is_uen_verified}>"
