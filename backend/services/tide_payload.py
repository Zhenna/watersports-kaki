"""
The tide part of the conditions response. Pure, so it is unit-testable.

Returns None when there is nothing solid to say (no table, or the table does not bracket now), and the page
then shows "Tide data unavailable". The block gives facts with their source and caveats. It gives no advice.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from services.tide_table import SGT, coverage_end, tide_now

SOURCE = "NEA, from MPA predictions"
NOTE = ("Predicted, not measured. Heights are metres above Chart Datum, not water depth at the launch. "
        "NEA doesn't name the station, and other sources can differ by about 15 to 20 minutes.")


def _ext(e) -> dict:
    return {"kind": e.kind, "at": e.at.astimezone(SGT).isoformat(), "height_m": e.height_m}


def build_tide_block(table: Optional[dict], info: Optional[dict] = None, now: Optional[datetime] = None) -> Optional[dict]:
    if not table or not table.get("extremes"):
        return None
    now = (now or datetime.now(SGT)).astimezone(SGT)
    state = tide_now(table["extremes"], now)
    if state is None:
        return None
    today = [e for e in table["extremes"] if e.at.astimezone(SGT).date() == now.date()]
    # A day's chart needs the tide before midnight and the one after it, so the curve reaches both edges.
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    chart = [e for e in table["extremes"]
             if day_start - timedelta(hours=9) <= e.at.astimezone(SGT) <= day_start + timedelta(hours=33)]
    # The tide after the next one, so the card can show the turn that follows. None at the end of the table.
    after = next((e for e in table["extremes"] if e.at > state["next"].at), None)
    fetched = table.get("fetched_at")
    return {
        "source": SOURCE,
        "source_url": table.get("source_url"),
        "station": None,
        "datum": "chart_datum",
        "predicted": True,
        "state": state["state"],
        "previous": _ext(state["previous"]),
        "next": _ext(state["next"]),
        "after_next": _ext(after) if after else None,
        "height_estimate_m": state["height_estimate_m"],
        "leg_height_m": state["leg_height_m"],
        "leg_midpoint": state["leg_midpoint"].astimezone(SGT).isoformat(),
        "minutes_to_next": state["minutes_to_next"],
        "today": [_ext(e) for e in today],
        "chart": [_ext(e) for e in chart],
        "fetched_at": fetched.astimezone(SGT).isoformat() if isinstance(fetched, datetime) else None,
        "coverage_end": coverage_end(table["extremes"]).astimezone(SGT).isoformat(),
        "served_stale": bool((info or {}).get("served_stale")),
        "note": NOTE,
    }
