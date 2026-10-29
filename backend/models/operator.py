import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, Text, func, text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from .base import Base

# fee_model values:
# "commission"      - fee_value is a percentage of booking price (e.g. 10.00)
# "per_participant" - fee_value is SGD per verified participant
# "referral"        - fee_value is SGD per qualified lead / booked group


class Operator(Base):
    """
    A business that fulfils watersports experiences (school, rental, cable park, tour).
    WSK aggregates demand; the operator hosts, takes payment and carries liability.
    """
    __tablename__ = "operators"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
                           server_default=text("gen_random_uuid()"))
    name          = Column(String(150), nullable=False)
    sports        = Column(ARRAY(String(30)), nullable=False, default=list)
    contact_name  = Column(String(100), nullable=True)
    contact_email = Column(String(200), nullable=True)
    website       = Column(String(300), nullable=True)
    fee_model     = Column(String(20), nullable=True)
    fee_value     = Column(Numeric(10, 2), nullable=True)
    is_active     = Column(Boolean, nullable=False, default=True)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    sessions = relationship("ActivitySession", back_populates="operator", lazy="dynamic")

    def __repr__(self):
        return f"<Operator {self.name}>"
