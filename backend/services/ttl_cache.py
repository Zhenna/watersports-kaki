"""
A small in-process cache for things that rarely change, such as a spot's rules, sectors and launch point.

It is for the synchronous database reads, which run in worker threads, so it is safe to call from several threads
at once. A slow load never holds a lock, so one slow database call cannot block everyone else. Two threads that ask
for the same missing key at the same moment may both load it once. That is harmless.

An error from the loader is passed on and nothing is stored, so a failed lookup is tried again next time.
Every caller gets its own copy, so one request can never change what another request sees.
A time-to-live of 0 turns the cache off.
"""
from __future__ import annotations

import copy
import threading
import time
from typing import Callable


class TtlCache:
    def __init__(self, ttl_seconds: float = 120, clock: Callable[[], float] = time.monotonic, max_entries: int = 256):
        self.ttl = float(ttl_seconds)
        self.clock = clock
        self.max_entries = max_entries
        self._store: dict = {}
        self._lock = threading.Lock()

    def get(self, key, loader: Callable[[], object]):
        if self.ttl > 0:
            now = self.clock()
            with self._lock:
                entry = self._store.get(key)
                if entry is not None and now - entry[0] < self.ttl:
                    return copy.deepcopy(entry[1])
        value = loader()                              # outside the lock; if it raises, nothing is stored
        if self.ttl > 0:
            with self._lock:
                if key not in self._store and len(self._store) >= self.max_entries:
                    oldest = min(self._store, key=lambda k: self._store[k][0])
                    del self._store[oldest]
                self._store[key] = (self.clock(), copy.deepcopy(value))
        return value

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._store)
