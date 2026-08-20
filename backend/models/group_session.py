import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class GroupSession(Base):
    __tablename__ = "group_sessions"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id       = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    confirmed_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_slot = Column(DateTime(timezone=True), nullable=True)
    # "upcoming" | "completed" | "cancelled"
    # completed → triggers review link if a coach is in group_members
    status         = Column(String(20), nullable=False, default="upcoming")
    confirmed_at   = Column(DateTime(timezone=True), server_default=func.now())

    group   = relationship("Group", back_populates="sessions")
    reviews = relationship("CoachReview", back_populates="session", lazy="dynamic")

    def __repr__(self):
        return f"<GroupSession group={self.group_id} [{self.status}]>"
