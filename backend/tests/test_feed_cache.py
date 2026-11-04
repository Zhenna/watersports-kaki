import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.feed_cache import FeedCache  # noqa: E402


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class TestFeedCache(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.cache = FeedCache(ttl_seconds=60, clock=self.clock)
        self.calls = 0
        self.fail = False

    async def fetcher(self):
        self.calls += 1
        if self.fail:
            raise RuntimeError("boom " + "x" * 500)
        return {"n": self.calls}

    def get(self):
        return asyncio.run(self.cache.get("k", self.fetcher))

    def test_cache_hit_within_ttl(self):
        r1, i1 = self.get()
        self.clock.t += 30
        r2, i2 = self.get()
        self.assertEqual(self.calls, 1)
        self.assertEqual(r1, r2)
        self.assertTrue(i2["cached"])
        self.assertFalse(i1["cached"])

    def test_refetch_after_ttl(self):
        self.get()
        self.clock.t += 61
        r, i = self.get()
        self.assertEqual(self.calls, 2)
        self.assertEqual(r["n"], 2)

    def test_failure_without_cache_is_none(self):
        self.fail = True
        r, i = self.get()
        self.assertIsNone(r)
        self.assertFalse(i["ok"])
        self.assertFalse(i["served_stale"])
        self.assertLessEqual(len(i["error"]), 300)

    def test_failure_with_cache_serves_last_good_and_says_so(self):
        self.get()
        self.clock.t += 120
        self.fail = True
        r, i = self.get()
        self.assertEqual(r, {"n": 1})
        self.assertFalse(i["ok"])
        self.assertTrue(i["served_stale"])


if __name__ == "__main__":
    unittest.main()
