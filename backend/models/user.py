import uuid
from datetime import date, datetime
from sqlalchemy import (
    Column, String, Boolean, Date, DateTime,
    Text, ARRAY, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class User(Base):
    __tablename__ = "users"

    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone              = Column(String(20), unique=True, nullable=False, index=True)
    display_name       = Column(String(50), nullable=False)
    date_of_birth      = Column(Date, nullable=True)
    gender             = Column(String(50), nullable=True)
    sports             = Column(ARRAY(Text), nullable=False, default=[])
    levels             = Column(ARRAY(Text), nullable=False, default=[])
    contact_whatsapp   = Column(String(20), nullable=True)
    contact_instagram  = Column(String(50), nullable=True)
    contact_email      = Column(String(255), nullable=True)
    contact_visibility = Column(String(20), nullable=False, default="mutual")
    show_checkin_date  = Column(Boolean, nullable=False, default=False)
    is_active          = Column(Boolean, nullable=False, default=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    last_seen          = Column(DateTime(timezone=True), nullable=True)

    checkins             = relationship("Checkin", back_populates="user", lazy="dynamic")
    sent_connections     = relationship("Connection", foreign_keys="Connection.from_user_id", back_populates="from_user", lazy="dynamic")
    received_connections = relationship("Connection", foreign_keys="Connection.to_user_id", back_populates="to_user", lazy="dynamic")

    @property
    def age(self) -> int | None:
        if not self.date_of_birth:
            return None
        today = date.today()
        return (
            today.year - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    @property
    def is_underage(self) -> bool:
        age = self.age
        return age is not None and age < 16

    def __repr__(self):
        return f"<User {self.display_name} ({self.phone})>"