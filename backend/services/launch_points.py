"""
Choosing which launch point to show for a spot and activity. Pure functions, no database,
so they are unit-testable. Rows are SpotLaunchPoint objects (or anything with the same attributes).

A launch point is shown only if it is reviewed, or the caller allows unreviewed rows
(provisional guidance or preview mode). A row whose numbers look wrong is skipped rather than shown.
"""
from __future__ import annotations

import math
from typing import Optional


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _valid(r) -> bool:
    if not all(_finite(getattr(r, k, None)) for k in ("lat", "lng", "shore_bearing_deg", "sea_bearing_deg")):
        return False
    if not (-90 <= r.lat <= 90 and -180 <= r.lng <= 180):
        return False
    if not (0 <= r.shore_bearing_deg <= 360 and 0 <= r.sea_bearing_deg <= 360):
        return False
    # the sea side must be about at right angles to the shoreline, within 15 degrees
    gap = (r.sea_bearing_deg - r.shore_bearing_deg) % 360
    return abs(gap - 90) <= 15 or abs(gap - 270) <= 15


def select_launch_point(rows, activity_id, allow_unreviewed: bool = False) -> Optional[dict]:
    """The launch point to send for this activity, or None. Prefers a row for this exact activity
    over one for every activity, then a reviewed row over an unreviewed one, then the name."""
    best, best_key = None, None
    for r in rows or []:
        if r.activity_id is not None and r.activity_id != activity_id:
            continue
        reviewed = bool(r.reviewed_by)
        if not reviewed and not allow_unreviewed:
            continue
        if not _valid(r):
            continue
        key = (r.activity_id == activity_id, reviewed, tuple(-ord(c) for c in (r.name or "")))
        if best_key is None or key > best_key:
            best, best_key = r, key
    if best is None:
        return None
    return {
        "name": best.name,
        "lat": best.lat,
        "lng": best.lng,
        "shore_bearing_deg": best.shore_bearing_deg,
        "sea_bearing_deg": best.sea_bearing_deg,
        "note": best.note,
        "review_status": "reviewed" if best.reviewed_by else "unreviewed",
    }
