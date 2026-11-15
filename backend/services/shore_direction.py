"""
How the wind relates to the shore: onshore, cross_shore or offshore, as one small block for the page.

Pure functions, no database. The class comes from classify_direction() in conditions_rules, so the sector
rules and the "more cautious class on a boundary" rule live in one place. The block names the class and which
other classes the nearby stations fall in. It gives no advice.
"""
from __future__ import annotations

from typing import Optional

from services.conditions_rules import classify_direction


def shore_direction(primary_deg, other_degs, sectors, sectors_reviewed: bool = False) -> Optional[dict]:
    """The block to send, or None when there is nothing solid to say: no mapped sectors, no usable
    direction reading, or a direction outside every sector (the rules engine already reports that case).

    primary_deg is the bearing the page uses. other_degs are the bearings of the other nearby stations.
    other_classes lists the classes those stations fall in that differ from the primary one."""
    if not sectors:
        return None
    cls = classify_direction(primary_deg, sectors)
    if cls is None:
        return None
    differing = []
    for d in other_degs or []:
        c = classify_direction(d, sectors)
        if c is not None and c != cls and c not in differing:
            differing.append(c)
    return {
        "class": cls,
        "other_classes": differing,
        "review_status": "reviewed" if sectors_reviewed else "unreviewed",
    }
