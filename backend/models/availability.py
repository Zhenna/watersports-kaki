import uuid
from sqlalchemy import (Column, String, SmallInteger, DateTime, ForeignKey,
                        UniqueConstraint, CheckConstraint, func, text)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class UserAvailability(Base):
    """
    Recurring weekly availability, owned by the user, not by an intent or an app.
    weekday: 0 = Monday ... 6 = Sunday. part_of_day: am | pm | evening.
    Sat AM = (5, 'am'). "Weekday evenings" = (0..4, 'evening'), one row each.
    Singapore local time.
    """
    __tablename__ = "user_availability"
    __table_args__ = (
        UniqueConstraint("user_id", "weekday", "part_of_day", name="uq_user_availability"),
        CheckConstraint("weekday between 0 and 6", name="ck_user_availability_weekday"),
        CheckConstraint("part_of_day in ('am', 'pm', 'evening')",
                        name="ck_user_availability_part_of_day"),
    )

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                         server_default=text("gen_random_uuid()"))
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False)
    weekday     = Column(SmallInteger, nullable=False)
    part_of_day = Column(String(10), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="availability")
