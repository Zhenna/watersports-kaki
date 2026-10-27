import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class Connection(Base):
    """
    Mutual follow relationship between two users.

    Status flow:
      pending   → from_user followed, to_user hasn't followed back
      connected → mutual follow
      declined  → to_user declined (invisible to from_user)

    Avoid flags — either True = never place in same group. Direction doesn't matter.
    Avoid does NOT affect contact visibility — only group placement.

    Contact details are never auto-revealed. Use ContactShare for explicit sharing.
    """
    __tablename__ = "connections"
    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", name="uq_connection_pair"),
    )

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id  = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    to_user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    status        = Column(String(20), nullable=False, default="pending")
    # Avoid flags — shown in follow button UI, silent to the avoided person
    from_avoided  = Column(Boolean, nullable=False, default=False)
    to_avoided    = Column(Boolean, nullable=False, default=False)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    connected_at  = Column(DateTime(timezone=True), nullable=True)

    from_user = relationship("User", foreign_keys=[from_user_id],
                             back_populates="sent_connections")
    to_user   = relationship("User", foreign_keys=[to_user_id],
                             back_populates="received_connections")

    def __repr__(self):
        return f"<Connection {self.from_user_id} → {self.to_user_id} [{self.status}]>"


class ContactShare(Base):
    """
    Explicit one-way contact share after mutual follow.
    Owner decides which fields to share and when.
    Revoking a follow does not auto-delete shares — handled separately.
    """
    __tablename__ = "contact_shares"
    __table_args__ = (
        UniqueConstraint("from_user_id", "to_user_id", name="uq_contact_share_pair"),
    )

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    to_user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    share_whatsapp = Column(Boolean, nullable=False, default=False)
    share_instagram = Column(Boolean, nullable=False, default=False)
    share_email    = Column(Boolean, nullable=False, default=False)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    updated_at     = Column(DateTime(timezone=True), onupdate=func.now())

    from_user = relationship("User", foreign_keys=[from_user_id],
                             back_populates="contact_shares_sent")
    to_user   = relationship("User", foreign_keys=[to_user_id],
                             back_populates="contact_shares_received")

    def __repr__(self):
        return f"<ContactShare {self.from_user_id} → {self.to_user_id}>"
