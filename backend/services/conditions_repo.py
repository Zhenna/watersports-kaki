"""
Database reads and writes for the conditions endpoint. Synchronous, so call these
through starlette's run_in_threadpool from async routes.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from core.db import get_session
from models import Spot, Activity, ActivityConditionRule, FeedFetchLog
from services.conditions_rules import Rule, WindSector


from services.guidance_policy import preview_mode, provisional_guidance, select_sectors  # noqa: E402,F401


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
    forecast_region: Optional[str] = None


def load_context(slug: str, activity_slug: str, level: str, include_private: bool = False,
                 include_unreviewed: bool = False) -> SpotContext:
    """Load a spot, its activity, the level's rules and the wind sectors.
    include_private (preview mode) also allows non-public spots and unreviewed sectors.
    include_unreviewed (provisional guidance) allows unreviewed sectors, and nothing else."""
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

        sectors = select_sectors(spot.wind_sectors, act.id, include_private or include_unreviewed)

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
            forecast_region=spot.forecast_region,
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


def list_conditions_activities() -> list:
    """Activities that have a conditions view, driven by activities.config.conditions_enabled."""
    with get_session() as db:
        rows = db.execute(select(Activity).where(Activity.is_active.is_(True))).scalars().all()
        out = [{"slug": a.slug, "name": a.name}
               for a in rows if (a.config or {}).get("conditions_enabled") is True]
        return sorted(out, key=lambda r: r["name"])


def list_spots_for_activity(activity_slug: str, include_private: bool = False) -> list:
    """Public spots that support the activity. include_private is preview mode only."""
    with get_session() as db:
        act = db.execute(
            select(Activity).where(Activity.slug == activity_slug, Activity.is_active.is_(True))
        ).scalar_one_or_none()
        if act is None or (act.config or {}).get("conditions_enabled") is not True:
            raise NotFound("Activity not found")
        spots = db.execute(select(Spot).options(selectinload(Spot.activities))).scalars().all()
        out = [
            {"slug": sp.slug, "name": sp.name}
            for sp in spots
            if sp.slug and (sp.is_public or include_private)
            and any(a.id == act.id for a in sp.activities)
        ]
        return sorted(out, key=lambda r: r["name"])
