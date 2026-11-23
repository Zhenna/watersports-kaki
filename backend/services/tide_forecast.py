"""
The tide part of the forecast response: for each day, a word for the morning and the afternoon.
Pure, so it is unit-testable. It reads the same NEA/MPA table as the tide card and adds no new source.

AM is 06:00 to 12:00 and PM is 12:00 to 18:00, which matches NEA's own forecast periods. The word for a period is the
direction the tide moves for most of it: "Rising" or "Falling". If neither direction covers at least two-thirds of the
period, the tide turns near the middle, and the word says so: "Rising, then falling" or "Falling, then rising".

Anything the table does not cover is left out. The page then shows "Not available", never a guess.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional

from services.tide_payload import NOTE, SOURCE
from services.tide_table import SGT, coverage_end

log = logging.getLogger(__name__)

PERIODS = {"am": (6, 12), "pm": (12, 18)}
CLEAR_SHARE = 2 / 3


def _at(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=SGT) + timedelta(hours=hour)


def _direction(extremes, t: datetime) -> Optional[str]:
    """The way the tide moves at t: after a low it rises, after a high it falls. None before the table starts."""
    last = None
    for e in extremes:
        if e.at <= t:
            last = e
        else:
            break
    if last is None:
        return None
    return "rising" if last.kind == "low" else "falling"


def period_word(extremes, day: date, start_h: int, end_h: int) -> Optional[str]:
    if not extremes:
        return None
    t0, t1 = _at(day, start_h), _at(day, end_h)
    end = coverage_end(extremes)
    if end is None or t1 > end:
        return None                                    # do not describe time the table does not cover
    cur = _direction(extremes, t0)
    if cur is None:
        return None
    first = cur
    spent = {"rising": 0.0, "falling": 0.0}
    last = t0
    for e in extremes:
        if t0 < e.at < t1:
            spent[cur] += (e.at - last).total_seconds()
            cur = "falling" if e.kind == "high" else "rising"
            last = e.at
    spent[cur] += (t1 - last).total_seconds()
    total = (t1 - t0).total_seconds()
    if spent["rising"] / total >= CLEAR_SHARE:
        return "Rising"
    if spent["falling"] / total >= CLEAR_SHARE:
        return "Falling"
    return "Rising, then falling" if first == "rising" else "Falling, then rising"


def tide_for_day(extremes, day: date) -> Optional[dict]:
    am = period_word(extremes, day, *PERIODS["am"])
    pm = period_word(extremes, day, *PERIODS["pm"])
    if am is None and pm is None:
        return None
    return {"am": am, "pm": pm}


def add_tide_to_forecast(payload, table) -> None:
    """Adds a "tide" entry to each forecast day, in place. It never raises: if anything is unexpected the payload is left as it was."""
    try:
        if not isinstance(payload, dict) or not isinstance(table, dict) or not table.get("extremes"):
            log.info("forecast has no tide: the tide table is not available")
            return
        extremes = table["extremes"]
        added = False
        for d in payload.get("days") or []:
            if not isinstance(d, dict) or not isinstance(d.get("date"), str):
                continue
            try:
                day = date.fromisoformat(d["date"])
            except ValueError:
                continue
            t = tide_for_day(extremes, day)
            if t:
                d["tide"] = t
                added = True
        if added:
            payload["tide_source"] = SOURCE
            payload["tide_note"] = NOTE
    except Exception:                                  # a tide problem must never break the forecast, but it must not hide either
        log.warning("could not add the tide to the forecast", exc_info=True)
        return
