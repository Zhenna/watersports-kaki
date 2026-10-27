import uuid
from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .base import Base


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id  = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="members")
    user  = relationship("User", back_populates="group_memberships")

    def __repr__(self):
        return f"<GroupMember group={self.group_id} user={self.user_id}>"
