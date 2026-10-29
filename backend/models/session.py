import uuid
from sqlalchemy import (Column, String, Boolean, DateTime, ForeignKey, Integer,
                        Numeric, func)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class ActivitySession(Base):
    """
    A group activity session formed from aggregated intent.
    Two modes:
      - community: no operator, optional Kaki Leader as coordinator (not an instructor)
      - operator-hosted: operator_id set; operator delivers, takes payment, carries liability.
        WSK earns a fee on attended bookings (see Operator.fee_model).
    """
    __tablename__ = "activity_sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sport           = Column(String(30), nullable=False, index=True)
    spot_id         = Column(UUID(as_uuid=True), ForeignKey("spots.id", ondelete="SET NULL"),
                             nullable=True)
    scheduled_time  = Column(DateTime(timezone=True), nullable=True)
    kaki_leader_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
                             nullable=True)
    operator_id     = Column(UUID(as_uuid=True), ForeignKey("operators.id", ondelete="SET NULL"),
                             nullable=True, index=True)
    price_sgd       = Column(Numeric(10, 2), nullable=True)
    capacity        = Column(Integer, nullable=True)
    booking_url     = Column(String(500), nullable=True)
    # set after the session, from verified attendance x operator fee model
    referral_fee_sgd = Column(Numeric(10, 2), nullable=True)
    # pending | invoiced | paid
    fee_status      = Column(String(20), nullable=True)
    # forming | proposed | confirmed | completed | cancelled
    status          = Column(String(20), nullable=False, default="forming")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    kaki_leader = relationship("User", foreign_keys=[kaki_leader_id],
                               back_populates="sessions_led")
    operator    = relationship("Operator", back_populates="sessions")
    members     = relationship("SessionMember", back_populates="session", lazy="dynamic")

    def __repr__(self):
        return f"<ActivitySession {self.sport} [{self.status}]>"


class SessionMember(Base):
    __tablename__ = "session_members"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id   = Column(UUID(as_uuid=True), ForeignKey("activity_sessions.id",
                           ondelete="CASCADE"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    booked_at    = Column(DateTime(timezone=True), nullable=True)
    verified     = Column(Boolean, nullable=False, default=False)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    joined_at    = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("ActivitySession", back_populates="members")
    user    = relationship("User", back_populates="session_members")

    def __repr__(self):
        return f"<SessionMember session={self.session_id} user={self.user_id}>"
