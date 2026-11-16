"""
NEA tide timings: parse the page, check the numbers, and say where the tide is now.

No network and no database here, so every function is unit-testable. The page lists every high and low
tide per day for this month and next, from the Maritime and Port Authority (MPA). Heights are metres above
Chart Datum, not water depth. The page does not name the station.

Anything unexpected fails closed: parse_tide_page raises TideTableError, validate_extremes returns a list of
problems, and tide_now returns None when it cannot bracket the time. Nothing here guesses.

    python -m services.tide_table /tmp/nea_tide.html     check a saved copy of the page
"""
from __future__ import annotations

import math
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Optional

SGT = timezone(timedelta(hours=8))
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

MIN_GAP_H = 3.0          # consecutive extremes were 4.4 to 7.6 hours apart in Nov and Dec 2026
MAX_GAP_H = 9.0
MIN_HEIGHT_M = -0.5      # Chart Datum is the lowest recorded level, so heights sit near or above zero
MAX_HEIGHT_M = 5.0
MIN_DAYS_COVERED = 20


class TideTableError(Exception):
    pass


@dataclass(frozen=True)
class Extreme:
    at: datetime         # Singapore time
    height_m: float      # above Chart Datum
    kind: str            # "high" or "low"


class _Tables(HTMLParser):
    """Collects every table as rows of (text, rowspan) cells, and the text that sits outside tables."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.outside = [], []
        self._depth = 0
        self._rows = None
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._depth += 1
            if self._depth == 1:
                self._rows = []
        elif self._depth == 1 and tag == "tr":
            self._row = []
        elif self._depth == 1 and tag in ("td", "th") and self._row is not None:
            span = 1
            for k, v in attrs:
                if k == "rowspan" and v and v.strip().isdigit():
                    span = int(v)
            self._cell = [span, []]

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            self._row.append((" ".join("".join(self._cell[1]).split()), self._cell[0]))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._rows is not None:
            self._rows.append(self._row)
            self._row = None
        elif tag == "table" and self._depth > 0:
            if self._depth == 1 and self._rows is not None:
                self.tables.append(self._rows)
                self._rows = None
            self._depth -= 1

    def handle_data(self, data):
        if self._cell is not None:
            self._cell[1].append(data)
        elif self._depth == 0:
            self.outside.append(data)


_TIME = re.compile(r"^(\d{1,2}):?(\d{2})$")
_NUM = re.compile(r"^-?\d+(\.\d+)?$")


def _month_of(token: str) -> Optional[int]:
    t = token.strip().lower()[:3]
    return MONTHS.index(t) + 1 if t in MONTHS and token.strip().isalpha() else None


def _years_from_labels(text: str) -> dict:
    """Month number to year, from labels such as 'Nov 2026 Dec 2026' that sit outside the tables."""
    found = {}
    for m in re.finditer(r"\b([A-Za-z]{3,9})\s+(20\d{2})\b", text):
        month = _month_of(m.group(1))
        if month and month not in found:
            found[month] = int(m.group(2))
    return found


def _table_month(rows) -> Optional[int]:
    for row in rows[:2]:
        for text, _ in row:
            month = _month_of(text)
            if month:
                return month
    return None


def _table_entries(rows):
    """(day, hhmm text, height text, kind text) from each data row. The day cell is only on a day's first row,
    and may be a merged cell, so every row is read from its last three cells."""
    day = None
    out = []
    for row in rows:
        texts = [t for t, _ in row]
        if len(texts) < 3:
            continue
        time_t, height_t, kind_t = texts[-3], texts[-2], texts[-1]
        if not (_TIME.match(time_t) and _NUM.match(height_t) and kind_t.strip().lower() in ("h", "l", "high", "low")):
            continue
        if len(texts) >= 4 and texts[-4].isdigit():
            day = int(texts[-4])
        if day is None:
            raise TideTableError("a tide row appeared before any day number")
        out.append((day, time_t, height_t, kind_t))
    return out


def parse_tide_page(html: str, today: Optional[datetime] = None) -> list:
    """All highs and lows on the page, in time order. Raises TideTableError if the page is not what we expect."""
    if not isinstance(html, str) or not html.strip():
        raise TideTableError("empty page")
    p = _Tables()
    try:
        p.feed(html)
        p.close()
    except Exception as e:                                   # malformed markup
        raise TideTableError(f"could not read the page: {e}")
    if not p.tables:
        raise TideTableError("no tables found on the page")

    labels = _years_from_labels(" ".join(p.outside))
    today = today or datetime.now(SGT)
    extremes = []
    months_seen = 0
    for rows in p.tables:
        month = _table_month(rows)
        if month is None:
            continue                                         # some other table on the page
        year = labels.get(month)
        if year is None:                                     # no label: the page shows this month and the next
            for y in (today.year - 1, today.year, today.year + 1):
                offset = (y - today.year) * 12 + (month - today.month)
                if -1 <= offset <= 2:
                    year = y
                    break
        if year is None:
            raise TideTableError(f"could not tell the year for month {month}")
        entries = _table_entries(rows)
        if not entries:
            raise TideTableError(f"a table for month {month} had no tide rows")
        months_seen += 1
        for day, time_t, height_t, kind_t in entries:
            m = _TIME.match(time_t)
            hour, minute = int(m.group(1)), int(m.group(2))
            try:
                at = datetime(year, month, day, hour, minute, tzinfo=SGT)
            except ValueError:
                raise TideTableError(f"impossible date or time: {year}-{month:02d}-{day:02d} {time_t}")
            extremes.append(Extreme(at, float(height_t), "high" if kind_t.strip().lower() in ("h", "high") else "low"))
    if months_seen == 0:
        raise TideTableError("no month tables found on the page")
    extremes.sort(key=lambda e: e.at)
    return extremes


def validate_extremes(extremes) -> list:
    """A list of problems, empty when the table looks right."""
    problems = []
    if not extremes:
        return ["no tide data"]
    days = {e.at.date() for e in extremes}
    if len(days) < MIN_DAYS_COVERED:
        problems.append(f"only {len(days)} days covered, expected at least {MIN_DAYS_COVERED}")
    for e in extremes:
        if not (isinstance(e.height_m, float) and math.isfinite(e.height_m)) or not (MIN_HEIGHT_M <= e.height_m <= MAX_HEIGHT_M):
            problems.append(f"implausible height {e.height_m} at {e.at:%Y-%m-%d %H:%M}")
    for a, b in zip(extremes, extremes[1:]):
        gap = (b.at - a.at).total_seconds() / 3600
        if gap <= 0:
            problems.append(f"times are not increasing at {b.at:%Y-%m-%d %H:%M}")
        elif not (MIN_GAP_H <= gap <= MAX_GAP_H):
            problems.append(f"{gap:.1f} hours between tides at {a.at:%Y-%m-%d %H:%M}")
        if a.kind == b.kind:
            problems.append(f"two {a.kind}s in a row at {b.at:%Y-%m-%d %H:%M}")
        else:
            high, low = (a, b) if a.kind == "high" else (b, a)
            if high.height_m <= low.height_m:
                problems.append(f"a high is not above its neighbouring low at {high.at:%Y-%m-%d %H:%M}")
    return problems


def tide_now(extremes, now: Optional[datetime] = None) -> Optional[dict]:
    """Where the tide is at `now`, or None if the table does not bracket it. The height is an estimate:
    a smooth curve between the last and the next extreme, not a measurement."""
    now = now or datetime.now(SGT)
    prev = nxt = None
    for e in extremes or []:
        if e.at <= now:
            prev = e
        elif nxt is None:
            nxt = e
            break
    if prev is None or nxt is None or prev.kind == nxt.kind:
        return None
    span = (nxt.at - prev.at).total_seconds()
    if not (MIN_GAP_H * 3600 <= span <= MAX_GAP_H * 3600):
        return None
    f = (now - prev.at).total_seconds() / span
    height = prev.height_m + (nxt.height_m - prev.height_m) * (1 - math.cos(math.pi * f)) / 2
    return {
        "state": "rising" if prev.kind == "low" else "falling",
        "previous": prev,
        "next": nxt,
        "height_estimate_m": round(height, 1),
        "leg_height_m": round(abs(nxt.height_m - prev.height_m), 1),
        "leg_midpoint": prev.at + (nxt.at - prev.at) / 2,
        "minutes_to_next": round((nxt.at - now).total_seconds() / 60),
    }


def coverage_end(extremes) -> Optional[datetime]:
    return extremes[-1].at if extremes else None


def _main(argv) -> int:
    if len(argv) != 1:
        print("Usage: python -m services.tide_table <saved page.html>")
        return 2
    with open(argv[0], encoding="utf-8", errors="replace") as fh:
        html = fh.read()
    try:
        ex = parse_tide_page(html)
    except TideTableError as e:
        print(f"Could not read the page: {e}")
        return 1
    problems = validate_extremes(ex)
    print(f"Read {len(ex)} tides, {ex[0].at:%Y-%m-%d %H:%M} to {ex[-1].at:%Y-%m-%d %H:%M}, "
          f"{len({e.at.date() for e in ex})} days")
    for e in ex[:4]:
        print(f"  {e.at:%Y-%m-%d %H:%M}  {e.kind:4}  {e.height_m} m")
    now = tide_now(ex)
    if now:
        print(f"Now: {now['state']}, about {now['height_estimate_m']} m, leg {now['leg_height_m']} m, "
              f"next {now['next'].kind} at {now['next'].at:%H:%M}")
    else:
        print("Now: the table does not cover this moment")
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems[:15]:
            print("  -", p)
        return 1
    print("The table looks right.")
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
