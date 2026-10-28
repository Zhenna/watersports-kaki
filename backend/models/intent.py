import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base

# intent_type values:
# "doing"       — sport they actively practise
# "interested"  — "I'm interested" for this weekend
# "want_to_try" — future curiosity, cross-sport discovery


class Intent(Base):
    __tablename__ = "intents"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    sport        = Column(String(30), nullable=False, index=True)
    intent_type  = Column(String(20), nullable=False, default="interested")
    level        = Column(String(20), nullable=True)
    spot_name    = Column(String(100), nullable=True)
    time_slot    = Column(String(30), nullable=True)
    is_active    = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    expires_at   = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="intents")

    def __repr__(self):
        return f"<Intent user={self.user_id} sport={self.sport} type={self.intent_type}>"
