import copy
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.conditions_rules import Rule, Observation, WindReading, evaluate  # noqa: E402
from services.forecast import (  # noqa: E402
    parse_four_day, parse_24h, build_days, build_forecast_payload, norm_direction, _slot_of,
    rules_reviewed,
)

SGT = timezone(timedelta(hours=8))
NOW = datetime(2026, 11, 15, 10, 0, tzinfo=SGT)  # a Sunday
ISSUED = "2026-11-15T06:00:00+08:00"
RULES = [Rule("windsurf", "beginner", "wind_speed_kmh", 8, 20, "v1", "Instructor", "2026-11-10")]


def day(date, low, high, direction="NE", text="Fair"):
    return {"day": "x", "timestamp": f"{date}T00:00:00+08:00",
            "forecast": {"summary": text, "code": "FA", "text": text},
            "relativeHumidity": {"low": 60, "high": 95}, "temperature": {"low": 25, "high": 32},
            "wind": {"speed": {"low": low, "high": high}, "direction": direction}}


def four_day(days, issued=ISSUED):
    return {"code": 0, "errorMsg": "", "data": {"records": [
        {"date": issued[:10], "updatedTimestamp": issued, "timestamp": issued, "forecasts": days}]}}


STANDARD = four_day([
    day("2026-11-16", 10, 20, "NE", "Afternoon thundery showers"),
    day("2026-11-17", 2, 6, "N", "Fair"),
    day("2026-11-18", 5, 25, "NNE", "Cloudy"),
    day("2026-11-19", 15, 25, "E", "Fair"),
    day("2026-11-20", 10, 15, "E", "Fair"),   # five days out: beyond the horizon
])


def h24_payload(issued=ISSUED):
    def period(start, end, **regions):
        return {"timePeriod": {"start": start, "end": end, "text": "x"},
                "regions": {k: {"code": "X", "text": v} for k, v in regions.items()}}
    return {"code": 0, "errorMsg": "", "data": {"records": [{
        "date": "2026-11-15", "updatedTimestamp": issued, "timestamp": issued,
        "general": {"temperature": {"low": 25, "high": 32}, "forecast": {"code": "TL", "text": "Thundery Showers"},
                    "validPeriod": {"start": "2026-11-15T18:00:00+08:00", "end": "2026-11-16T18:00:00+08:00", "text": "x"},
                    "wind": {"speed": {"low": 10, "high": 20}, "direction": "NE"}},
        "periods": [
            period("2026-11-15T18:00:00+08:00", "2026-11-16T06:00:00+08:00", east="Fair (Night)", west="Cloudy"),
            period("2026-11-16T06:00:00+08:00", "2026-11-16T12:00:00+08:00", east="Fair (Day)", west="Cloudy"),
            period("2026-11-16T12:00:00+08:00", "2026-11-16T18:00:00+08:00", east="Thundery Showers", west="Showers"),
        ]}]}}


def days_for(four=STANDARD, h24=None, region=None, rules=RULES, level="beginner", wind_dependent=True,
             publish=True, now=NOW, sectors=None):
    return build_days(parse_four_day(four) if four is not None else None,
                      parse_24h(h24) if h24 is not None else None,
                      region, rules, "windsurf", level, wind_dependent, sectors or [], publish, now=now)


def by_date(days):
    return {d["date"]: d for d in days}


class TestParsing(unittest.TestCase):
    def test_four_day_documented_shape(self):
        p = parse_four_day(STANDARD)
        self.assertEqual(p["issued_at"], ISSUED)
        self.assertEqual(len(p["days"]), 5)
        first = p["days"][0]
        self.assertEqual((first["date"], first["wind_low"], first["wind_high"], first["direction"]),
                         ("2026-11-16", 10.0, 20.0, "NE"))
        self.assertEqual(first["text"], "Afternoon thundery showers")

    def test_four_day_older_snake_case_shape(self):
        payload = {"data": {"items": [{"update_timestamp": ISSUED, "forecasts": [
            {"date": "2026-11-16", "forecast": "Fair", "wind": {"speed": {"low": 5, "high": 15}, "direction": "Northeast"}}]}]}}
        p = parse_four_day(payload)
        self.assertEqual(p["days"][0]["direction"], "NE")
        self.assertEqual(p["days"][0]["text"], "Fair")
        self.assertEqual(p["issued_at"], ISSUED)

    def test_unrecognised_shapes_give_nothing(self):
        for bad in (None, {}, [], "x", {"data": None}, {"data": {"records": "nope"}}, {"data": {"records": [1, 2]}}):
            self.assertIsNone(parse_four_day(bad), bad)
            self.assertIsNone(parse_24h(bad), bad)

    def test_days_without_a_valid_date_are_skipped_and_missing_wind_is_none(self):
        payload = four_day([{"forecast": {"text": "Fair"}}, day("2026-11-16", None, None)])
        p = parse_four_day(payload)
        self.assertEqual(len(p["days"]), 1)
        self.assertIsNone(p["days"][0]["wind_low"])

    def test_direction_names(self):
        self.assertEqual(norm_direction("NE"), "NE")
        self.assertEqual(norm_direction(" north-east"), "NE")
        self.assertEqual(norm_direction("Southwest"), "SW")
        self.assertIsNone(norm_direction("sideways"))
        self.assertIsNone(norm_direction(None))

    def test_24h_general_and_periods(self):
        p = parse_24h(h24_payload())
        self.assertEqual((p["wind_low"], p["wind_high"], p["direction"]), (10.0, 20.0, "NE"))
        self.assertEqual(p["text"], "Thundery Showers")
        self.assertEqual(len(p["periods"]), 3)
        self.assertEqual(p["periods"][2]["regions"]["east"], "Thundery Showers")

    def test_slot_boundaries_use_singapore_time(self):
        self.assertIsNone(_slot_of("2026-11-16T05:59:00+08:00"))
        self.assertEqual(_slot_of("2026-11-16T06:00:00+08:00"), ("2026-11-16", "AM"))
        self.assertEqual(_slot_of("2026-11-16T11:59:00+08:00"), ("2026-11-16", "AM"))
        self.assertEqual(_slot_of("2026-11-16T12:00:00+08:00"), ("2026-11-16", "PM"))
        self.assertIsNone(_slot_of("2026-11-16T18:00:00+08:00"))
        # 22:00 UTC on 15 Nov is 06:00 on 16 Nov in Singapore
        self.assertEqual(_slot_of("2026-11-15T22:00:00+00:00"), ("2026-11-16", "AM"))
        self.assertIsNone(_slot_of(None))
        self.assertIsNone(_slot_of("garbage"))


class TestBuildDays(unittest.TestCase):
    def test_only_the_next_four_days_are_offered(self):
        dates = [d["date"] for d in days_for()]
        self.assertEqual(dates, ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"])

    def test_wind_range_is_assessed_with_the_same_rules(self):
        d = by_date(days_for())
        self.assertEqual(d["2026-11-16"]["guidance"]["wind_position"], "within")
        self.assertEqual(d["2026-11-17"]["guidance"]["wind_position"], "below")
        self.assertEqual(d["2026-11-19"]["guidance"]["wind_position"], "mixed")   # 15-25 straddles 20
        self.assertEqual(d["2026-11-18"]["guidance"]["wind_status"], "inconclusive")

    def test_forecast_wording(self):
        g = by_date(days_for())["2026-11-16"]["guidance"]
        self.assertIn("Forecast wind is 10.0 to 20.0 km/h", g["wind_summary"])
        self.assertIn("within the WSK reference range", g["wind_summary"])
        straddle = by_date(days_for())["2026-11-18"]["guidance"]["wind_summary"]
        self.assertIn("straddles", straddle)
        self.assertNotIn("Nearby stations", straddle)

    def test_a_forecast_never_fails_for_missing_lightning(self):
        g = by_date(days_for())["2026-11-16"]["guidance"]
        self.assertNotEqual(g["status"], "unavailable")
        self.assertEqual(g["wind_reasons"], [])
        self.assertFalse(any("lightning" in f["message"].lower() for f in g["flags"]))

    def test_wind_block_has_knots_and_direction(self):
        w = by_date(days_for())["2026-11-16"]["wind"]
        self.assertEqual((w["kmh_low"], w["kmh_high"]), (10.0, 20.0))
        self.assertEqual((w["knots_low"], w["knots_high"]), (5.4, 10.8))
        self.assertEqual((w["direction"], w["from_deg"]), ("NE", 45))

    def test_an_old_outlook_is_unavailable_not_trusted(self):
        old = four_day([day("2026-11-16", 10, 20)], issued="2026-11-14T10:00:00+08:00")   # 24 hours old
        d = by_date(days_for(four=old))["2026-11-16"]
        self.assertTrue(d["stale"])
        self.assertEqual(d["guidance"]["wind_status"], "unavailable")
        self.assertIn("wind data is out of date", d["guidance"]["wind_reasons"])

    def test_a_fresh_outlook_is_not_stale(self):
        self.assertFalse(by_date(days_for())["2026-11-16"]["stale"])

    def test_missing_wind_is_unavailable(self):
        d = by_date(days_for(four=four_day([day("2026-11-16", None, None)])))["2026-11-16"]
        self.assertIsNone(d["wind"])
        self.assertEqual(d["guidance"]["wind_status"], "unavailable")

    def test_unreviewed_rules_hide_the_guidance_but_keep_the_facts(self):
        unreviewed = [Rule("windsurf", "beginner", "wind_speed_kmh", 8, 20, "draft-1")]
        d = by_date(days_for(rules=unreviewed, publish=False))["2026-11-16"]
        self.assertEqual(d["guidance"]["status"], "not_published")
        self.assertIsNone(d["guidance"]["wind_summary"])
        self.assertIsNotNone(d["wind"])

    def test_unknown_level_is_never_favourable(self):
        d = by_date(days_for(level="expert"))["2026-11-16"]
        self.assertEqual(d["guidance"]["wind_status"], "unavailable")

    def test_wind_independent_activity(self):
        d = by_date(days_for(wind_dependent=False, rules=[]))["2026-11-16"]
        self.assertEqual(d["guidance"]["wind_status"], "not_applicable")

    def test_nothing_parsed_gives_no_days(self):
        self.assertEqual(days_for(four=None, h24=None), [])


class TestWeatherText(unittest.TestCase):
    def test_slots_use_the_24h_forecast_for_the_spots_region(self):
        d = by_date(days_for(h24=h24_payload(), region="east"))["2026-11-16"]
        self.assertEqual(d["slots"]["AM"], {"text": "Fair (Day)", "thundery": False, "source": "nea_24h"})
        self.assertEqual(d["slots"]["PM"], {"text": "Thundery Showers", "thundery": True, "source": "nea_24h"})
        self.assertTrue(d["thundery"])

    def test_another_region_gives_that_regions_text(self):
        d = by_date(days_for(h24=h24_payload(), region="west"))["2026-11-16"]
        self.assertEqual(d["slots"]["PM"]["text"], "Showers")
        self.assertFalse(d["slots"]["PM"]["thundery"])

    def test_unknown_region_falls_back_to_the_general_text(self):
        d = by_date(days_for(h24=h24_payload(), region=None))["2026-11-16"]
        self.assertEqual(d["slots"]["AM"]["text"], "Thundery Showers")

    def test_days_beyond_the_24h_forecast_use_the_daily_text_for_both_slots(self):
        d = by_date(days_for(h24=h24_payload(), region="east"))["2026-11-17"]
        self.assertEqual(d["slots"]["AM"], {"text": "Fair", "thundery": False, "source": "daily"})
        self.assertEqual(d["slots"]["PM"]["source"], "daily")

    def test_thundery_is_detected_from_the_daily_text(self):
        d = by_date(days_for())["2026-11-16"]
        self.assertTrue(d["thundery"])
        self.assertFalse(by_date(days_for())["2026-11-17"]["thundery"])


class TestPayload(unittest.TestCase):
    def test_payload_shape(self):
        days = days_for()
        p = build_forecast_payload({"slug": "x"}, "windsurf", "beginner", days, True, now=NOW)
        self.assertEqual(p["horizon_days"], 4)
        self.assertTrue(p["available"])
        self.assertIn("Island-wide", p["note"])
        self.assertTrue(p["generated_at"].endswith("+08:00"))
        self.assertEqual(len(p["days"]), 4)
        self.assertIn("not safety advice", p["disclaimer"])

    def test_payload_is_json_serialisable(self):
        import json
        json.dumps(build_forecast_payload({"slug": "x"}, "windsurf", "beginner",
                                          days_for(h24=h24_payload(), region="east"), True, now=NOW))


class TestGating(unittest.TestCase):
    def test_rules_reviewed_needs_a_reviewer_for_this_activity_and_level(self):
        self.assertTrue(rules_reviewed(RULES, "windsurf", "beginner"))
        self.assertFalse(rules_reviewed(RULES, "windsurf", "advanced"))
        self.assertFalse(rules_reviewed(RULES, "sup", "beginner"))
        self.assertFalse(rules_reviewed([Rule("windsurf", "beginner", "wind_speed_kmh", 8, 20, "draft-1")],
                                        "windsurf", "beginner"))
        self.assertFalse(rules_reviewed([], "windsurf", "beginner"))


class TestEngineOptions(unittest.TestCase):
    def test_include_lightning_false_skips_the_lightning_check(self):
        o = Observation(wind_kmh=12, wind_readings=[WindReading(12)], wind_age_min=0, lightning=None)
        with_check = evaluate("windsurf", "beginner", o, RULES)
        without = evaluate("windsurf", "beginner", o, RULES, include_lightning=False)
        self.assertEqual(with_check.status, "unavailable")
        self.assertEqual(without.status, "within_reference_range")

    def test_reading_subject_changes_the_wording_for_several_readings(self):
        o = Observation(wind_readings=[WindReading(10), WindReading(12)], wind_age_min=0, lightning=None)
        a = evaluate("windsurf", "beginner", o, RULES, include_lightning=False,
                     reading_subject="Forecast wind is", reading_all="")
        self.assertTrue(a.wind_summary.startswith("Forecast wind is 10.0 to 12.0 km/h"))
        self.assertNotIn("all within", a.wind_summary)


if __name__ == "__main__":
    unittest.main()
