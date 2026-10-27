import uuid
from sqlalchemy import Column, String, Integer, Boolean, Float, DateTime, Text, ARRAY, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Experience(Base):
    """
    Reusable activity template — persists after sessions end.
    Becomes a discovery and demand-generation asset over time.

    Example: "Beginner Wakesurf + Sunset Dinner"
    Has multiple Occurrences (Run #1, Run #2, ...)

    Loop: Experience → Do This Again → new Intent → Demand →
          new Occurrence → Reviews/media → Stronger Experience page → more demand
    """
    __tablename__ = "experiences"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title            = Column(String(150), nullable=False)
    sport            = Column(String(30), nullable=False, index=True)
    description      = Column(Text, nullable=True)
    difficulty       = Column(String(20), nullable=True)   # "beginner" | "intermediate" | "advanced"
    duration_hours   = Column(Float, nullable=True)
    # Price range from past occurrences — updated as occurrences complete
    price_min_sgd    = Column(Integer, nullable=True)
    price_max_sgd    = Column(Integer, nullable=True)
    # Created by a business or coach
    created_by       = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
                               nullable=True)
    # Demand signal — users who tapped "Do This Again"
    do_again_count   = Column(Integer, nullable=False, default=0)
    is_active        = Column(Boolean, nullable=False, default=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())

    occurrences = relationship("Occurrence", back_populates="experience", lazy="dynamic")

    def __repr__(self):
        return f"<Experience {self.title}>"


class Occurrence(Base):
    """
    A specific run of an Experience.
    Links back to the group session that produced it.
    Accumulates reviews and media — feeds the Experience page.
    """
    __tablename__ = "occurrences"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experience_id = Column(UUID(as_uuid=True), ForeignKey("experiences.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    session_id    = Column(UUID(as_uuid=True), ForeignKey("group_sessions.id", ondelete="SET NULL"),
                           nullable=True)
    run_number    = Column(Integer, nullable=False, default=1)  # Run #1, Run #2...
    participant_count = Column(Integer, nullable=False, default=0)
    price_sgd     = Column(Integer, nullable=True)
    # "upcoming" | "completed" | "cancelled"
    status        = Column(String(20), nullable=False, default="upcoming")
    occurred_at   = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    experience = relationship("Experience", back_populates="occurrences")

    def __repr__(self):
        return f"<Occurrence run={self.run_number} experience={self.experience_id}>"
