from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, datetime
from uuid import UUID


class UserCreate(BaseModel):
    phone: str
    display_name: str
    sports: list[str]
    levels: list[str]
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    contact_whatsapp: Optional[str] = None
    contact_instagram: Optional[str] = None
    contact_email: Optional[str] = None

    @field_validator("sports")
    @classmethod
    def valid_sports(cls, v):
        allowed = {"windsurf", "wakesurf", "wakeboard", "sup", "kayak", "diving"}
        for s in v:
            if s not in allowed:
                raise ValueError(f"Unknown sport: {s}. Allowed: {allowed}")
        return v

    @field_validator("levels")
    @classmethod
    def valid_levels(cls, v):
        allowed = {"beginner", "intermediate", "advanced"}
        for l in v:
            if l not in allowed:
                raise ValueError(f"Unknown level: {l}. Allowed: {allowed}")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def min_age(cls, v):
        if v is None:
            return v
        today = date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 16:
            raise ValueError("Must be at least 16 years old.")
        return v


class UserPublic(BaseModel):
    """
    Before mutual follow.
    Shows: display name, sports, levels, gender, check-in count, member since.
    Hides: spots, check-in times, contact details.
    """
    id: UUID
    display_name: str
    sports: list[str]
    levels: list[str]
    gender: Optional[str] = None
    created_at: datetime
    checkin_count: int = 0

    model_config = {"from_attributes": True}


class UserMutual(UserPublic):
    """
    After mutual follow.
    Adds: spot names in check-in history, weekday/weekend time label.
    show_checkin_date tells the frontend whether exact dates are available.
    Contact details still not revealed — require explicit share action.
    """
    show_checkin_date: bool = False


class UserPrivacyUpdate(BaseModel):
    """User updating their own privacy settings. All fields optional."""
    show_checkin_date: Optional[bool] = None


class ContactShareRequest(BaseModel):
    """
    Explicit one-way contact share — always voluntary, always after mutual follow.
    Owner decides which fields to share. Recipient sees only what was shared.
    """
    to_user_id: UUID
    share_whatsapp: bool = False
    share_instagram: bool = False
    share_email: bool = False