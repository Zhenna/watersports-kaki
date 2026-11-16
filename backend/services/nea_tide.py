"""
Fetching NEA's tide timings page, with the same failure rules as the other feeds.

get_tide_table downloads the page, reads it, checks it, and returns the table. Anything wrong raises, and
nothing here ever invents a tide. TideFeed keeps the last good table in memory and refetches at most twice a
day. If NEA is down or the layout changes, it serves the last good table until the dates it covers run out,
and it waits a while before trying again so a broken page cannot slow every request.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Awaitable, Callable, Optional

from services.tide_table import SGT, TideTableError, parse_tide_page, tide_now, validate_extremes

TIDE_PAGE_URL = "https://www.nea.gov.sg/corporate-functions/weather/tide-timings"
USER_AGENT = "WaterSportsKaki/0.1 (+https://www.watersportskaki.sg)"
MAX_PAGE_CHARS = 2_000_000


async def _http_get(url: str) -> str:
    import httpx   # imported here so the parser and its tests need no network library
    async with httpx.AsyncClient(timeout=8, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text


async def get_tide_table(http_get: Optional[Callable[[str], Awaitable[str]]] = None,
                         now: Optional[datetime] = None) -> dict:
    """Download, read and check the page. Raises TideTableError (or a network error) if anything is off."""
    http_get = http_get or _http_get
    now = now or datetime.now(SGT)
    html = await http_get(TIDE_PAGE_URL)
    if not isinstance(html, str) or len(html) > MAX_PAGE_CHARS:
        raise TideTableError("the page was not the expected size or type")
    extremes = parse_tide_page(html, today=now)
    problems = validate_extremes(extremes)
    if problems:
        raise TideTableError("table failed its checks: " + "; ".join(problems[:3]))
    if tide_now(extremes, now) is None:
        raise TideTableError("the table does not cover the current time")
    return {"extremes": extremes, "fetched_at": now, "source_url": TIDE_PAGE_URL}


class TideFeed:
    """get() returns (table_or_None, info), where info has the same keys as FeedCache.get."""

    def __init__(self, ttl_seconds: float = 43200, retry_after_seconds: float = 900,
                 fetcher: Optional[Callable[[], Awaitable[dict]]] = None,
                 clock: Callable[[], float] = time.monotonic):
        self.ttl = ttl_seconds
        self.retry_after = retry_after_seconds
        self._fetcher = fetcher or get_tide_table
        self._clock = clock
        self._entry = None            # (fetched at, table)
        self._retry_at = 0.0
        self._last_error = None

    async def get(self):
        now = self._clock()
        entry = self._entry
        if entry and now - entry[0] < self.ttl:
            return entry[1], {"ok": True, "cached": True, "served_stale": False, "error": None, "duration_ms": 0}
        if now < self._retry_at:
            # Failed recently: do not call NEA again yet, and report as cached so nothing is logged each request.
            return (entry[1] if entry else None), {"ok": False, "cached": True, "served_stale": bool(entry),
                                                   "error": self._last_error, "duration_ms": 0}
        start = self._clock()
        try:
            table = await self._fetcher()
        except Exception as e:                                   # any failure means "unknown", never "fine"
            self._last_error = f"{type(e).__name__}: {e}"[:300]
            self._retry_at = self._clock() + self.retry_after
            return (entry[1] if entry else None), {"ok": False, "cached": False, "served_stale": bool(entry),
                                                   "error": self._last_error,
                                                   "duration_ms": int((self._clock() - start) * 1000)}
        self._entry = (self._clock(), table)
        self._retry_at = 0.0
        self._last_error = None
        return table, {"ok": True, "cached": False, "served_stale": False, "error": None,
                       "duration_ms": int((self._clock() - start) * 1000)}
