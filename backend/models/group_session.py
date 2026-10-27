import uuid
from sqlalchemy import Column, String, Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class GroupSession(Base):
    __tablename__ = "group_sessions"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id       = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    confirmed_by   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
                            nullable=True)
    confirmed_slot = Column(DateTime(timezone=True), nullable=True)
    # "upcoming" | "completed" | "cancelled"
    # completed + has_coach on parent group → triggers review link
    status         = Column(String(20), nullable=False, default="upcoming")
    confirmed_at   = Column(DateTime(timezone=True), server_default=func.now())

    group   = relationship("Group", back_populates="sessions")
    reviews = relationship("CoachReview", back_populates="session", lazy="dynamic")

    def __repr__(self):
        return f"<GroupSession group={self.group_id} [{self.status}]>"


class SessionAvailability(Base):
    __tablename__ = "session_availability"

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id  = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    date_from = Column(Date, nullable=False)
    date_to   = Column(Date, nullable=False)
    # "morning" | "afternoon" | "evening" | "full_day"
    time_slot = Column(String(20), nullable=False)

    group = relationship("Group", back_populates="availabilities")

    def __repr__(self):
        return f"<SessionAvailability group={self.group_id} user={self.user_id}>"


class Message(Base):
    __tablename__ = "messages"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id     = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    # Nullable — system messages have no user
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
                          nullable=True)
    content      = Column(String, nullable=False)
    # "user"   — regular message, makes group permanent
    # "system" — app-generated: availability prompt, session confirmed, review link
    message_type = Column(String(20), nullable=False, default="user")
    sent_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    group = relationship("Group", back_populates="messages")

    def __repr__(self):
        return f"<Message group={self.group_id} type={self.message_type}>"
