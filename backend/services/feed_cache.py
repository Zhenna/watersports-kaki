"""
Small in-process cache for feed fetches.

- Within the TTL, the cached result is returned without calling the provider.
- If a fetch fails, the last good result is served if there is one. Its own timestamp
  keeps ageing, so the rules engine marks it stale and fails closed once it is too old.
- With no cached result, a failure returns None, which means "unavailable".
"""
from __future__ import annotations

import time
from typing import Awaitable, Callable, Optional


class FeedCache:
    def __init__(self, ttl_seconds: float = 60, clock: Callable[[], float] = time.monotonic):
        self.ttl = ttl_seconds
        self.clock = clock
        self._store: dict = {}

    async def get(self, key: str, fetcher: Callable[[], Awaitable[dict]]):
        """Return (result_or_None, info). info has ok, cached, served_stale, error, duration_ms."""
        now = self.clock()
        entry = self._store.get(key)
        if entry and now - entry[0] < self.ttl:
            return entry[1], {"ok": True, "cached": True, "served_stale": False,
                              "error": None, "duration_ms": 0}
        start = self.clock()
        try:
            result = await fetcher()
        except Exception as e:  # any provider failure means "unknown", never "fine"
            info = {"ok": False, "cached": False, "served_stale": bool(entry),
                    "error": f"{type(e).__name__}: {e}"[:300],
                    "duration_ms": int((self.clock() - start) * 1000)}
            return (entry[1] if entry else None), info
        self._store[key] = (self.clock(), result)
        return result, {"ok": True, "cached": False, "served_stale": False, "error": None,
                        "duration_ms": int((self.clock() - start) * 1000)}
