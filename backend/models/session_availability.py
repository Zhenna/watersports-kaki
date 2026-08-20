import uuid
from sqlalchemy import Column, String, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class SessionAvailability(Base):
    __tablename__ = "session_availability"

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id  = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date_from = Column(Date, nullable=False)
    date_to   = Column(Date, nullable=False)
    # "morning" | "afternoon" | "evening" | "full_day"
    time_slot = Column(String(20), nullable=False)

    group = relationship("Group", back_populates="availabilities")

    def __repr__(self):
        return f"<SessionAvailability group={self.group_id} user={self.user_id}>"
