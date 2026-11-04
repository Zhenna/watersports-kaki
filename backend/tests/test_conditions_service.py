import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.conditions_rules import Rule, evaluate, STATUS_WITHIN, STATUS_UNAVAILABLE, STATUS_FLAGGED  # noqa: E402
from services.conditions_service import (  # noqa: E402
    haversine_km, parse_iso, age_minutes, nearest_station, lightning_summary, build_observation,
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone(timedelta(hours=8)))
SPOT = (1.3021, 103.9130)  # East Coast
RULES = [Rule("windsurf", "beginner", "wind_speed_kmh", 8, 20, "v1", "Instructor", "2026-11-10")]


def iso(minutes_ago):
    return (NOW - timedelta(minutes=minutes_ago)).isoformat()


def wind_feed(ts, speed=12.0, include_coords=True):
    r = {"station_id": "S1", "station_name": "Near", "value_kmh": speed}
    far = {"station_id": "S2", "station_name": "Far", "value_kmh": 30.0}
    if include_coords:
        r.update(lat=1.31, lng=103.92)
        far.update(lat=1.45, lng=103.82)
    return {"timestamp": ts, "readings": [far, r]}


def dir_feed(deg=200.0):
    return {"timestamp": iso(1), "readings": [
        {"station_id": "S1", "station_name": "Near", "degrees": deg, "lat": 1.31, "lng": 103.92},
    ]}


def lightning_feed(strikes=None, ts=None):
    return {"timestamp": ts or NOW.isoformat(), "strike_count": len(strikes or []), "strikes": strikes or []}


class TestHelpers(unittest.TestCase):
    def test_haversine(self):
        # Marina Barrage to Pasir Ris Park, roughly 14 km
        self.assertAlmostEqual(haversine_km(1.2804, 103.8706, 1.3814, 103.9474), 14.1, delta=0.4)
        self.assertEqual(haversine_km(1.3, 103.9, 1.3, 103.9), 0.0)

    def test_parse_iso(self):
        self.assertIsNotNone(parse_iso("2026-11-04T12:00:00+08:00"))
        self.assertIsNotNone(parse_iso("2026-11-04T04:00:00Z"))
        self.assertIsNone(parse_iso("2026-11-04T12:00:00"))   # naive: unknown timezone
        self.assertIsNone(parse_iso("garbage"))
        self.assertIsNone(parse_iso(None))

    def test_age_minutes(self):
        self.assertAlmostEqual(age_minutes(iso(10), NOW), 10.0, places=3)
        self.assertEqual(age_minutes(iso(-2), NOW), 0.0)       # small clock skew
        self.assertIsNone(age_minutes(iso(-10), NOW))          # too far in the future
        self.assertIsNone(age_minutes("garbage", NOW))

    def test_nearest_station_picks_closest_and_skips_bad(self):
        readings = [
            {"station_id": "far", "value_kmh": 30, "lat": 1.45, "lng": 103.82},
            {"station_id": "no_coords", "value_kmh": 5},
            {"station_id": "bad_value", "value_kmh": float("nan"), "lat": 1.30, "lng": 103.91},
            {"station_id": "near", "value_kmh": 12, "lat": 1.31, "lng": 103.92},
        ]
        s = nearest_station(readings, *SPOT, "value_kmh")
        self.assertEqual(s["station_id"], "near")
        self.assertIsNone(nearest_station([], *SPOT, "value_kmh"))
        self.assertIsNone(nearest_station([{"station_id": "x", "value_kmh": 3}], *SPOT, "value_kmh"))

    def test_lightning_summary_counts_within_radius_only(self):
        strikes = [{"lat": 1.31, "lng": 103.92}, {"lat": 1.45, "lng": 103.82}, {"lat": None, "lng": None}]
        li = lightning_summary(strikes, *SPOT, radius_km=10, lookback_min=30, age_min=1)
        self.assertEqual(li.strike_count, 1)          # the 19 km strike is outside a 10 km radius
        self.assertLess(li.nearest_km, 3)
        wide = lightning_summary(strikes, *SPOT, radius_km=25, lookback_min=30, age_min=1)
        self.assertEqual(wide.strike_count, 2)        # and inside a 25 km radius

    def test_lightning_summary_no_strikes(self):
        li = lightning_summary([], *SPOT, radius_km=20, lookback_min=30, age_min=0)
        self.assertEqual(li.strike_count, 0)
        self.assertIsNone(li.nearest_km)


class TestBuildObservationWithEngine(unittest.TestCase):
    def run_engine(self, wind, direction, lightning):
        obs, meta = build_observation(wind, direction, lightning, *SPOT, now=NOW)
        return evaluate("windsurf", "beginner", obs, RULES), obs, meta

    def test_normal_case_uses_nearest_station_and_reports_distance(self):
        a, obs, meta = self.run_engine(wind_feed(iso(3)), dir_feed(), lightning_feed())
        self.assertEqual(a.status, STATUS_WITHIN)
        self.assertEqual(obs.wind_kmh, 12.0)
        self.assertEqual(meta["wind_station"]["station_name"], "Near")
        self.assertGreater(meta["wind_station"]["distance_km"], 0)

    def test_wind_feed_failure_is_unavailable_not_zero(self):
        a, obs, _ = self.run_engine(None, dir_feed(), lightning_feed())
        self.assertIsNone(obs.wind_kmh)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_lightning_feed_failure_is_unavailable(self):
        a, obs, _ = self.run_engine(wind_feed(iso(3)), dir_feed(), None)
        self.assertIsNone(obs.lightning)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_stale_wind_timestamp(self):
        a, _, _ = self.run_engine(wind_feed(iso(30)), dir_feed(), lightning_feed())
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_unparseable_wind_timestamp_fails_closed(self):
        a, _, _ = self.run_engine(wind_feed("not a time"), dir_feed(), lightning_feed())
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_stations_without_coordinates_are_not_used_as_the_users_wind(self):
        a, obs, _ = self.run_engine(wind_feed(iso(3), include_coords=False), dir_feed(), lightning_feed())
        self.assertIsNone(obs.wind_kmh)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_strike_at_zero_km_is_flagged(self):
        strikes = [{"lat": SPOT[0], "lng": SPOT[1]}]
        a, _, _ = self.run_engine(wind_feed(iso(3)), dir_feed(), lightning_feed(strikes))
        self.assertEqual(a.status, STATUS_FLAGGED)


if __name__ == "__main__":
    unittest.main()
