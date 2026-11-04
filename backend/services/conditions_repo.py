"""
Database reads and writes for the conditions endpoint. Synchronous, so call these
through starlette's run_in_threadpool from async routes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.db import get_session
from models import Spot, Activity, ActivityConditionRule, FeedFetchLog
from services.conditions_rules import Rule, WindSector


class NotFound(Exception):
    pass


class NotSupported(Exception):
    pass


@dataclass
class SpotContext:
    slug: str
    name: str
    lat: float
    lng: float
    activity_slug: str
    wind_dependent: bool
    rules: list
    sectors: list
    nea_station_id: Optional[str] = None


def load_context(slug: str, activity_slug: str, level: str, include_private: bool = False) -> SpotContext:
    """Load a spot, its activity, the level's rules and the reviewed wind sectors.
    include_private (preview mode) also allows non-public spots and unreviewed sectors."""
    with get_session() as db:
        spot = db.execute(
            select(Spot).where(Spot.slug == slug)
            .options(selectinload(Spot.wind_sectors), selectinload(Spot.activities))
        ).scalar_one_or_none()
        if spot is None or (not spot.is_public and not include_private):
            raise NotFound("Spot not found")

        act = db.execute(
            select(Activity).where(Activity.slug == activity_slug, Activity.is_active.is_(True))
        ).scalar_one_or_none()
        if act is None:
            raise NotFound("Activity not found")
        if not any(a.id == act.id for a in spot.activities):
            raise NotSupported(f"{activity_slug} is not supported at this spot")

        rule_rows = db.execute(
            select(ActivityConditionRule).where(
                ActivityConditionRule.activity_id == act.id,
                ActivityConditionRule.level == level,
            )
        ).scalars().all()
        rules = [
            Rule(
                activity_slug=act.slug,
                level=r.level,
                condition_type=r.condition_type,
                min_value=r.min_value,
                max_value=r.max_value,
                rule_version=r.rule_version,
                reviewed_by=r.reviewed_by,
                reviewed_at=r.reviewed_at.isoformat() if r.reviewed_at else None,
            )
            for r in rule_rows
        ]

        sectors = [
            WindSector(s.from_deg, s.to_deg, s.direction_class)
            for s in spot.wind_sectors
            if (s.activity_id is None or s.activity_id == act.id)
            and (include_private or s.reviewed_by)
        ]

        config = act.config or {}
        return SpotContext(
            slug=spot.slug,
            name=spot.name,
            lat=spot.lat,
            lng=spot.lng,
            activity_slug=act.slug,
            wind_dependent=bool(config.get("wind_dependent", True)),  # unknown means dependent
            rules=rules,
            sectors=sectors,
            nea_station_id=spot.nea_station_id,
        )


def log_fetches(entries: list) -> None:
    """Record fetch attempts. Never raises: logging must not break the response."""
    if not entries:
        return
    try:
        with get_session() as db:
            for e in entries:
                db.add(FeedFetchLog(
                    source=e["source"], feed=e["feed"], ok=e["ok"],
                    error=e.get("error"), duration_ms=e.get("duration_ms"),
                ))
            db.commit()
    except Exception:
        pass
