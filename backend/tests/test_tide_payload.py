import json
import re
import unittest
from datetime import datetime, timedelta

from services.tide_payload import NOTE, SOURCE, build_tide_block
from services.tide_table import SGT, parse_tide_page
from tests.test_tide_table import page

NOW = datetime(2026, 11, 16, 12, 30, tzinfo=SGT)
OK = {"ok": True, "cached": False, "served_stale": False, "error": None, "duration_ms": 5}


def table():
    return {"extremes": parse_tide_page(page()), "fetched_at": NOW - timedelta(hours=3),
            "source_url": "https://www.nea.gov.sg/corporate-functions/weather/tide-timings"}


class TideBlock(unittest.TestCase):
    def test_shape_for_the_example_moment(self):
        b = build_tide_block(table(), OK, NOW)
        self.assertEqual(b["state"], "rising")
        self.assertEqual((b["previous"]["kind"], b["previous"]["height_m"]), ("low", 1.7))
        self.assertEqual((b["next"]["kind"], b["next"]["height_m"]), ("high", 2.7))
        self.assertTrue(b["previous"]["at"].startswith("2026-11-16T08:50") and b["previous"]["at"].endswith("+08:00"))
        self.assertEqual(b["leg_height_m"], 1.0)
        self.assertTrue(b["leg_midpoint"].startswith("2026-11-16T11:35"))
        self.assertEqual(b["minutes_to_next"], 110)
        self.assertTrue(2.4 <= b["height_estimate_m"] <= 2.5)

    def test_today_lists_the_days_tides_in_order(self):
        b = build_tide_block(table(), OK, NOW)
        self.assertEqual([(t["kind"], t["height_m"]) for t in b["today"]],
                         [("high", 2.4), ("low", 1.7), ("high", 2.7), ("low", 0.9)])

    def test_chart_points_reach_past_both_edges_of_the_day(self):
        b = build_tide_block(table(), OK, NOW)
        times = [c["at"] for c in b["chart"]]
        self.assertEqual(times, sorted(times))
        self.assertTrue(times[0].startswith("2026-11-15T20:45"))      # the last tide of the day before
        self.assertTrue(times[-1].startswith("2026-11-17T04:50"))     # the first tide of the day after
        self.assertEqual(len(b["chart"]), 6)
        for t in b["today"]:
            self.assertIn(t, b["chart"])

    def test_chart_points_keep_the_gap_to_the_edge_under_the_limit(self):
        b = build_tide_block(table(), OK, datetime(2026, 11, 3, 12, 0, tzinfo=SGT))   # a three-tide day
        self.assertGreaterEqual(len(b["chart"]), 5)

    def test_the_tide_after_the_next_one_is_included(self):
        b = build_tide_block(table(), OK, NOW)
        self.assertEqual((b["after_next"]["kind"], b["after_next"]["height_m"]), ("low", 0.9))
        self.assertTrue(b["after_next"]["at"].startswith("2026-11-16T21:37"))
        late = build_tide_block(table(), OK, datetime(2026, 11, 16, 22, 16, tzinfo=SGT))
        self.assertEqual(late["next"]["kind"], "high")
        self.assertEqual(late["after_next"]["kind"], "low")                     # alternates with the next tide
        self.assertTrue(late["after_next"]["at"].startswith("2026-11-17T09:48"))

    def test_after_next_is_none_at_the_very_end_of_the_table(self):
        t = table()
        t["extremes"] = t["extremes"][:-1]
        end = t["extremes"][-2].at + timedelta(minutes=30)
        b = build_tide_block(t, OK, end)
        self.assertIsNotNone(b)
        self.assertIsNone(b["after_next"])

    def test_the_caveats_travel_with_the_numbers(self):
        b = build_tide_block(table(), OK, NOW)
        self.assertEqual(b["source"], SOURCE)
        self.assertIsNone(b["station"])
        self.assertEqual(b["datum"], "chart_datum")
        self.assertIs(b["predicted"], True)
        self.assertEqual(b["note"], NOTE)
        self.assertIn("not water depth", b["note"])
        self.assertIn("doesn't name the station", b["note"])

    def test_nothing_to_say_means_none(self):
        for t in (None, {}, {"extremes": []}):
            self.assertIsNone(build_tide_block(t, OK, NOW))
        self.assertIsNone(build_tide_block(table(), OK, datetime(2027, 3, 1, 12, 0, tzinfo=SGT)))
        self.assertIsNone(build_tide_block(table(), OK, datetime(2026, 10, 31, 12, 0, tzinfo=SGT)))

    def test_a_stale_table_is_flagged(self):
        self.assertFalse(build_tide_block(table(), OK, NOW)["served_stale"])
        self.assertTrue(build_tide_block(table(), dict(OK, served_stale=True, ok=False), NOW)["served_stale"])
        self.assertFalse(build_tide_block(table(), None, NOW)["served_stale"])

    def test_fetch_and_coverage_times_are_reported(self):
        b = build_tide_block(table(), OK, NOW)
        self.assertTrue(b["fetched_at"].startswith("2026-11-16T09:30"))
        self.assertTrue(b["coverage_end"].startswith("2026-12-31T23:01"))
        t = table()
        t.pop("fetched_at")
        self.assertIsNone(build_tide_block(t, OK, NOW)["fetched_at"])

    def test_it_is_json_serialisable(self):
        json.dumps(build_tide_block(table(), OK, NOW))

    def test_a_time_in_another_zone_still_finds_the_singapore_day(self):
        from datetime import timezone
        utc_now = datetime(2026, 11, 15, 17, 0, tzinfo=timezone.utc)      # 01:00 on 16 Nov in Singapore
        b = build_tide_block(table(), OK, utc_now)
        self.assertEqual(len(b["today"]), 4)
        self.assertTrue(b["today"][0]["at"].startswith("2026-11-16"))

    def test_no_advice_words(self):
        b = json.dumps(build_tide_block(table(), OK, NOW))
        for word in ("safe", "recommend", "avoid", "should", "good time", "ideal", "dangerous"):
            self.assertNotRegex(b.lower(), word)


if __name__ == "__main__":
    unittest.main()
