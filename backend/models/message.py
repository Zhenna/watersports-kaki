import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Message(Base):
    __tablename__ = "messages"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id     = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content      = Column(Text, nullable=False)
    # "user" = regular message
    # "system" = app-generated (availability prompt, session confirmed, review link)
    message_type = Column(String(20), nullable=False, default="user")
    sent_at      = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    group = relationship("Group", back_populates="messages")

    def __repr__(self):
        return f"<Message group={self.group_id} type={self.message_type}>"
