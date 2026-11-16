import unittest
from datetime import datetime, timedelta

from services.nea_tide import TideFeed, get_tide_table
from services.tide_table import SGT, TideTableError
from tests.test_tide_table import DEC, NOV, page

NOW = datetime(2026, 11, 16, 12, 30, tzinfo=SGT)


def fake_get(html):
    calls = []

    async def get(url):
        calls.append(url)
        if isinstance(html, Exception):
            raise html
        return html
    get.calls = calls
    return get


class GetTideTable(unittest.IsolatedAsyncioTestCase):
    async def test_a_good_page_gives_a_table(self):
        get = fake_get(page())
        table = await get_tide_table(get, NOW)
        self.assertEqual(len(table["extremes"]), 236)
        self.assertEqual(table["fetched_at"], NOW)
        self.assertEqual(get.calls, ["https://www.nea.gov.sg/corporate-functions/weather/tide-timings"])

    async def test_an_empty_or_changed_page_raises(self):
        for html in ("", "<html><body>Maintenance</body></html>", "<table><tr><td>x</td></tr></table>"):
            with self.assertRaises(TideTableError):
                await get_tide_table(fake_get(html), NOW)

    async def test_a_table_that_fails_its_checks_raises(self):
        broken = NOV.replace("10: 0000 3.0 H, 0537 1.4 L, 1100 3.0 H, 1739 0.4 L", "10: 0000 3.0 H, 1100 3.0 H, 1739 0.4 L")
        self.assertNotEqual(broken, NOV)
        with self.assertRaises(TideTableError) as cm:
            await get_tide_table(fake_get(page(nov=broken)), NOW)
        self.assertIn("failed its checks", str(cm.exception))

    async def test_a_table_that_does_not_cover_now_raises(self):
        with self.assertRaises(TideTableError):
            await get_tide_table(fake_get(page()), datetime(2027, 3, 1, 12, 0, tzinfo=SGT))

    async def test_a_huge_or_non_text_response_raises(self):
        with self.assertRaises(TideTableError):
            await get_tide_table(fake_get("x" * 2_500_000), NOW)
        with self.assertRaises(TideTableError):
            await get_tide_table(fake_get(b"bytes"), NOW)

    async def test_a_network_error_is_not_swallowed(self):
        with self.assertRaises(ConnectionError):
            await get_tide_table(fake_get(ConnectionError("down")), NOW)


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class TideFeedBehaviour(unittest.IsolatedAsyncioTestCase):
    def feed(self, results, **kw):
        self.clock = Clock()
        self.calls = 0
        queue = list(results)

        async def fetcher():
            self.calls += 1
            r = queue.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        return TideFeed(ttl_seconds=100, retry_after_seconds=50, fetcher=fetcher, clock=self.clock, **kw)

    async def test_first_get_fetches_and_the_second_uses_the_cache(self):
        f = self.feed([{"n": 1}])
        t, info = await f.get()
        self.assertEqual((t, info["ok"], info["cached"]), ({"n": 1}, True, False))
        t, info = await f.get()
        self.assertEqual((t, info["ok"], info["cached"]), ({"n": 1}, True, True))
        self.assertEqual(self.calls, 1)

    async def test_it_refetches_after_the_ttl(self):
        f = self.feed([{"n": 1}, {"n": 2}])
        await f.get()
        self.clock.t += 101
        t, info = await f.get()
        self.assertEqual((t, info["cached"]), ({"n": 2}, False))
        self.assertEqual(self.calls, 2)

    async def test_failure_with_nothing_cached_means_unavailable(self):
        f = self.feed([ConnectionError("down")])
        t, info = await f.get()
        self.assertIsNone(t)
        self.assertFalse(info["ok"])
        self.assertFalse(info["served_stale"])
        self.assertIn("ConnectionError", info["error"])

    async def test_it_backs_off_after_a_failure_and_does_not_log_again(self):
        f = self.feed([ConnectionError("down"), {"n": 1}])
        await f.get()
        for _ in range(5):
            t, info = await f.get()
            self.assertIsNone(t)
            self.assertTrue(info["cached"])      # the route logs only uncached fetches, so no repeated rows
            self.assertFalse(info["ok"])
        self.assertEqual(self.calls, 1)
        self.clock.t += 51
        t, info = await f.get()
        self.assertEqual((t, info["ok"]), ({"n": 1}, True))
        self.assertEqual(self.calls, 2)

    async def test_failure_after_success_serves_the_last_good_table(self):
        f = self.feed([{"n": 1}, TideTableError("layout changed")])
        await f.get()
        self.clock.t += 101
        t, info = await f.get()
        self.assertEqual(t, {"n": 1})
        self.assertFalse(info["ok"])
        self.assertTrue(info["served_stale"])
        self.assertIn("layout changed", info["error"])
        t, info = await f.get()                  # during the back-off it still serves it
        self.assertEqual(t, {"n": 1})
        self.assertTrue(info["served_stale"])

    async def test_a_success_clears_the_back_off_and_the_error(self):
        f = self.feed([ConnectionError("x"), {"n": 1}, {"n": 2}])
        await f.get()
        self.clock.t += 51
        await f.get()
        self.clock.t += 101
        t, info = await f.get()
        self.assertEqual((t, info["error"]), ({"n": 2}, None))

    async def test_the_error_text_is_short(self):
        f = self.feed([RuntimeError("x" * 1000)])
        _, info = await f.get()
        self.assertLessEqual(len(info["error"]), 300)

    async def test_it_works_with_the_real_fetcher_and_a_fake_download(self):
        get = fake_get(page())

        async def fetcher():
            return await get_tide_table(get, NOW)
        f = TideFeed(fetcher=fetcher)
        t, info = await f.get()
        self.assertTrue(info["ok"])
        self.assertEqual(len(t["extremes"]), 236)


if __name__ == "__main__":
    unittest.main()
