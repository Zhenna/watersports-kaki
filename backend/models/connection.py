import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Connection(Base):
    __tablename__ = "connections"
    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", name="uq_connection_pair"),
    )

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status       = Column(String(20), nullable=False, default="pending")
    # Avoid flags — either True = never place in same group, direction doesn't matter
    from_avoided = Column(Boolean, nullable=False, default=False)
    to_avoided   = Column(Boolean, nullable=False, default=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    connected_at = Column(DateTime(timezone=True), nullable=True)

    from_user = relationship("User", foreign_keys=[from_user_id], back_populates="sent_connections")
    to_user   = relationship("User", foreign_keys=[to_user_id], back_populates="received_connections")

    def __repr__(self):
        return f"<Connection {self.from_user_id} → {self.to_user_id} [{self.status}]>"
