import unittest
from datetime import date, datetime

from services.tide_forecast import (
    add_tide_to_forecast, extremes_in_day_window, hourly, period_word, tide_for_day,
)
from services.tide_table import SGT, Extreme, parse_tide_page
from tests.test_tide_table import page

EX = parse_tide_page(page())          # the real NEA table for Nov and Dec 2026, as the parser reads it


def ex(day, hh, mm, kind, h):
    return Extreme(at=datetime(2026, 11, day, hh, mm, tzinfo=SGT), height_m=h, kind=kind)


class Words(unittest.TestCase):
    def test_the_four_days_ahead_say_rising_in_the_morning_and_falling_in_the_afternoon(self):
        for d in (24, 25, 26, 27):
            self.assertEqual(period_word(EX, date(2026, 11, d), 6, 12), "Rising", d)
            self.assertEqual(period_word(EX, date(2026, 11, d), 12, 18), "Falling", d)

    def test_exactly_two_thirds_is_still_one_word(self):
        # 24 Nov: rising from 06:00 to the 10:01 high is 4h 01m of 6h, so just over two-thirds
        self.assertEqual(period_word(EX, date(2026, 11, 24), 6, 12), "Rising")

    def test_a_turn_near_the_middle_gets_both_words(self):
        table = [ex(5, 3, 0, "low", 1.0), ex(5, 9, 0, "high", 3.0), ex(5, 15, 30, "low", 0.5), ex(5, 22, 0, "high", 3.0)]
        self.assertEqual(period_word(table, date(2026, 11, 5), 6, 12), "Rising, then falling")    # 3h up, 3h down
        self.assertEqual(period_word(table, date(2026, 11, 5), 12, 18), "Falling, then rising")   # 3.5h down, 2.5h up

    def test_a_window_with_no_turn_is_one_word(self):
        table = [ex(5, 3, 0, "low", 1.0), ex(5, 14, 0, "high", 3.0), ex(5, 21, 0, "low", 0.5)]
        self.assertEqual(period_word(table, date(2026, 11, 5), 6, 12), "Rising")

    def test_time_the_table_does_not_cover_is_not_described(self):
        table = [ex(5, 3, 0, "low", 1.0), ex(5, 9, 0, "high", 3.0)]
        self.assertIsNone(period_word(table, date(2026, 11, 5), 6, 12))     # the table ends at 09:00
        self.assertIsNone(period_word(EX, date(2027, 6, 1), 6, 12))          # after the table
        self.assertIsNone(period_word(EX, date(2026, 10, 1), 6, 12))         # before the table starts
        self.assertIsNone(period_word([], date(2026, 11, 5), 6, 12))
        self.assertIsNone(period_word(None, date(2026, 11, 5), 6, 12))

    def test_only_the_four_known_phrases_are_ever_returned(self):
        allowed = {"Rising", "Falling", "Rising, then falling", "Falling, then rising"}
        d = date(2026, 11, 1)
        seen = set()
        while d <= date(2026, 12, 29):
            for a, b in ((6, 12), (12, 18)):
                w = period_word(EX, d, a, b)
                self.assertIn(w, allowed, f"{d} {a}")
                seen.add(w)
            d = date.fromordinal(d.toordinal() + 1)
        self.assertEqual(seen & {"Rising", "Falling"}, {"Rising", "Falling"})


class Hourly(unittest.TestCase):
    def test_twelve_hours_from_six_to_five(self):
        rows = hourly(EX, date(2026, 11, 24))
        self.assertEqual([r["time"] for r in rows], [f"{h:02d}:00" for h in range(6, 18)])
        self.assertEqual((rows[0]["height_m"], rows[0]["state"]), (1.7, "rising"))        # 06:00, after the 04:20 low
        self.assertEqual((rows[6]["height_m"], rows[6]["state"]), (2.5, "falling"))       # 12:00, after the 10:01 high
        self.assertEqual(rows[10]["height_m"], 0.3)                                       # 16:00, just before the low
        for r in rows:
            self.assertIn(r["state"], ("rising", "falling"))
            self.assertTrue(0.0 <= r["height_m"] <= 3.5)

    def test_none_if_any_hour_is_outside_the_table(self):
        self.assertIsNone(hourly(EX, date(2027, 6, 1)))
        self.assertIsNone(hourly([], date(2026, 11, 24)))

    def test_the_highs_and_lows_in_the_window(self):
        got = extremes_in_day_window(EX, date(2026, 11, 24))
        self.assertEqual(got, [{"kind": "high", "time": "10:01", "height_m": 3.1}, {"kind": "low", "time": "16:33", "height_m": 0.3}])


class Day(unittest.TestCase):
    def test_a_covered_day(self):
        t = tide_for_day(EX, date(2026, 11, 24))
        self.assertEqual((t["am"], t["pm"]), ("Rising", "Falling"))
        self.assertEqual(len(t["hourly"]), 12)
        self.assertEqual(len(t["extremes"]), 2)

    def test_an_uncovered_day_is_none(self):
        self.assertIsNone(tide_for_day(EX, date(2027, 6, 1)))

    def test_a_day_covered_only_in_the_morning(self):
        table = [ex(5, 3, 0, "low", 1.0), ex(5, 9, 0, "high", 3.0), ex(5, 14, 0, "low", 0.5)]
        t = tide_for_day(table, date(2026, 11, 5))
        self.assertEqual(t["am"], "Rising, then falling")
        self.assertIsNone(t["pm"])                               # the table ends at 14:00, before 18:00
        self.assertIsNone(t["hourly"])                           # so no hourly list either


class Enrich(unittest.TestCase):
    def payload(self):
        return {"available": True, "horizon_days": 4, "note": "n", "days": [
            {"date": "2026-11-24", "wind": {"knots_low": 5}}, {"date": "2026-11-25"}, {"date": "2027-06-01"}]}

    def test_adds_tide_to_days_the_table_covers_and_leaves_the_rest(self):
        p = self.payload()
        add_tide_to_forecast(p, {"extremes": EX})
        self.assertEqual(p["days"][0]["tide"]["am"], "Rising")
        self.assertEqual(p["days"][1]["tide"]["pm"], "Falling")
        self.assertNotIn("tide", p["days"][2])                    # beyond the table
        self.assertEqual(p["days"][0]["wind"], {"knots_low": 5})  # nothing else touched
        self.assertIn("Predicted, not measured", p["tide_note"])
        self.assertEqual(p["tide_source"], "NEA, from MPA predictions")

    def test_no_table_leaves_the_payload_exactly_as_it_was(self):
        for table in (None, {}, {"extremes": []}, {"extremes": None}, "x", 5):
            p = self.payload()
            before = repr(p)
            add_tide_to_forecast(p, table)
            self.assertEqual(repr(p), before, repr(table))

    def test_odd_payloads_never_raise(self):
        for p in (None, "x", 5, [], {}, {"days": None}, {"days": "x"}, {"days": [None, 5, "x", {}, {"date": 5}, {"date": "not a date"}]}):
            try:
                add_tide_to_forecast(p, {"extremes": EX})
            except Exception as e:                               # pragma: no cover
                self.fail(f"raised for {p!r}: {e}")

    def test_a_broken_table_never_raises_but_says_so_in_the_log(self):
        p = self.payload()
        with self.assertLogs("services.tide_forecast", level="WARNING") as logs:
            add_tide_to_forecast(p, {"extremes": [object(), object()]})
        self.assertIn("could not add the tide to the forecast", logs.output[0])
        self.assertNotIn("tide", p["days"][0])

    def test_a_missing_table_is_logged_quietly_at_info_level(self):
        p = self.payload()
        with self.assertLogs("services.tide_forecast", level="INFO") as logs:
            add_tide_to_forecast(p, None)
        self.assertIn("the tide table is not available", logs.output[0])
        self.assertNotIn("tide", p["days"][0])

    def test_no_tide_source_is_added_when_no_day_got_a_tide(self):
        p = {"days": [{"date": "2027-06-01"}]}
        add_tide_to_forecast(p, {"extremes": EX})
        self.assertNotIn("tide_note", p)


if __name__ == "__main__":
    unittest.main()
