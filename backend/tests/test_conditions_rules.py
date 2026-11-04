import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.conditions_rules import (  # noqa: E402
    Observation, LightningObservation, Rule, WindSector,
    evaluate, classify_direction,
    STATUS_UNAVAILABLE, STATUS_FLAGGED, STATUS_OUTSIDE, STATUS_WITHIN, STATUS_NOT_APPLICABLE,
)

REVIEWED = dict(rule_version="v1", reviewed_by="Instructor", reviewed_at="2026-11-10")
RULES = [
    Rule("windsurf", "beginner", "wind_speed_kmh", 8, 20, **REVIEWED),
    Rule("windsurf", "never_tried", "wind_speed_kmh", 8, 20, **REVIEWED),
    Rule("windsurf", "intermediate", "wind_speed_kmh", 15, 35, **REVIEWED),
    Rule("sup", "beginner", "wind_speed_kmh", 0, 12, rule_version="draft-1"),
]
SECTORS = [
    WindSector(315, 45, "offshore"),    # wraps through north
    WindSector(46, 134, "cross_shore"),
    WindSector(135, 314, "onshore"),
]
BANNED = [r"\bsafe to\b", r"\bis safe\b", r"good to go", r"get off the water", r"cat 1", r"cancel"]


def calm_lightning(age=2, strikes=0, nearest=None):
    return LightningObservation(strike_count=strikes, nearest_km=nearest, age_min=age)


def obs(wind=12, gust=None, frm=180, age=3, lightning="ok"):
    li = calm_lightning() if lightning == "ok" else lightning
    return Observation(wind_kmh=wind, gust_kmh=gust, wind_from_deg=frm, wind_age_min=age, lightning=li)


def all_text(a):
    return " ".join([a.summary] + [f.message for f in a.flags] + a.unavailable_reasons)


class TestStatus(unittest.TestCase):
    def test_within_range(self):
        a = evaluate("windsurf", "beginner", obs(wind=12), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_WITHIN)
        self.assertIn("not a safety clearance", a.summary)
        self.assertEqual(a.review_status, "reviewed")

    def test_above_range(self):
        a = evaluate("windsurf", "beginner", obs(wind=25), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_OUTSIDE)
        self.assertIn("above", a.summary)

    def test_below_range(self):
        a = evaluate("windsurf", "beginner", obs(wind=4), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_OUTSIDE)
        self.assertIn("below", a.summary)

    def test_never_tried_uses_its_own_rule(self):
        a = evaluate("windsurf", "never_tried", obs(wind=12), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_WITHIN)

    def test_wind_independent_activity(self):
        a = evaluate("wakesurf", "beginner", obs(wind=None, age=None), [], wind_dependent=False)
        self.assertEqual(a.status, STATUS_NOT_APPLICABLE)


class TestFailClosed(unittest.TestCase):
    def test_missing_wind_is_unavailable_not_zero(self):
        a = evaluate("windsurf", "beginner", obs(wind=None), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)
        self.assertIn("wind data unavailable", a.unavailable_reasons)

    def test_negative_and_nan_wind_are_missing(self):
        for bad in (-5, float("nan"), float("inf")):
            a = evaluate("windsurf", "beginner", obs(wind=bad), RULES, sectors=SECTORS)
            self.assertEqual(a.status, STATUS_UNAVAILABLE, bad)

    def test_stale_wind(self):
        self.assertEqual(evaluate("windsurf", "beginner", obs(age=15), RULES).status, STATUS_WITHIN)
        self.assertEqual(evaluate("windsurf", "beginner", obs(age=16), RULES).status, STATUS_UNAVAILABLE)

    def test_unknown_wind_age(self):
        a = evaluate("windsurf", "beginner", obs(age=None), RULES)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_lightning_feed_down(self):
        a = evaluate("windsurf", "beginner", obs(lightning=None), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)
        self.assertIn("lightning data unavailable", a.unavailable_reasons)

    def test_stale_lightning(self):
        ok = evaluate("windsurf", "beginner", obs(lightning=calm_lightning(age=10)), RULES)
        stale = evaluate("windsurf", "beginner", obs(lightning=calm_lightning(age=11)), RULES)
        self.assertEqual(ok.status, STATUS_WITHIN)
        self.assertEqual(stale.status, STATUS_UNAVAILABLE)

    def test_unknown_level_never_favourable(self):
        a = evaluate("windsurf", "expert", obs(), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_unknown_sport_never_favourable(self):
        a = evaluate("kitesurfing", "beginner", obs(), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_UNAVAILABLE)

    def test_empty_lightning_is_not_an_all_clear(self):
        a = evaluate("windsurf", "beginner", obs(), RULES, sectors=SECTORS)
        msg = next(f.message for f in a.flags if f.code == "no_strikes_observed")
        self.assertIn("not an all-clear", msg)


class TestLightning(unittest.TestCase):
    def test_nearby_strikes_flag_regardless_of_wind(self):
        li = calm_lightning(strikes=3, nearest=8.0)
        a = evaluate("windsurf", "beginner", obs(wind=12, lightning=li), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_FLAGGED)
        self.assertEqual(a.flags[0].code, "lightning_observed")
        self.assertIn("Lightning detected nearby", a.summary)

    def test_strikes_outside_radius_do_not_flag(self):
        li = calm_lightning(strikes=2, nearest=35.0)
        a = evaluate("windsurf", "beginner", obs(lightning=li), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_WITHIN)

    def test_flag_shown_even_when_wind_missing(self):
        li = calm_lightning(strikes=1, nearest=5.0)
        a = evaluate("windsurf", "beginner", obs(wind=None, lightning=li), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_FLAGGED)

    def test_applies_to_wind_independent_activities(self):
        li = calm_lightning(strikes=1, nearest=5.0)
        a = evaluate("diving", "beginner", obs(wind=None, age=None, lightning=li), [], wind_dependent=False)
        self.assertEqual(a.status, STATUS_FLAGGED)


class TestDirectionAndGusts(unittest.TestCase):
    def test_classify_wrap_and_edges(self):
        self.assertEqual(classify_direction(350, SECTORS), "offshore")
        self.assertEqual(classify_direction(10, SECTORS), "offshore")
        self.assertEqual(classify_direction(90, SECTORS), "cross_shore")
        self.assertEqual(classify_direction(180, SECTORS), "onshore")
        self.assertIsNone(classify_direction(None, SECTORS))
        self.assertIsNone(classify_direction(180, []))

    def test_offshore_beginner_advised_against(self):
        a = evaluate("windsurf", "beginner", obs(frm=350), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_FLAGGED)
        self.assertIn("Independent practice is not recommended", a.summary)

    def test_offshore_intermediate_is_caution_only(self):
        a = evaluate("windsurf", "intermediate", obs(wind=20, frm=350), RULES, sectors=SECTORS)
        self.assertEqual(a.status, STATUS_WITHIN)
        self.assertTrue(any(f.code == "offshore_wind" and f.severity == "caution" for f in a.flags))

    def test_no_sectors_means_direction_not_assessed(self):
        a = evaluate("windsurf", "beginner", obs(frm=350), RULES, sectors=[])
        self.assertTrue(any(f.code == "direction_not_assessed" for f in a.flags))
        self.assertNotEqual(a.status, STATUS_FLAGGED)

    def test_gusts_above_maximum(self):
        a = evaluate("windsurf", "beginner", obs(wind=15, gust=30), RULES, sectors=SECTORS)
        self.assertTrue(any(f.code == "gusts_above_reference" for f in a.flags))

    def test_missing_gusts_are_disclosed(self):
        a = evaluate("windsurf", "beginner", obs(gust=None), RULES, sectors=SECTORS)
        self.assertTrue(any(f.code == "gusts_not_available" for f in a.flags))


class TestReviewAndWording(unittest.TestCase):
    def test_unreviewed_rules_are_labelled(self):
        a = evaluate("sup", "beginner", obs(wind=8), RULES)
        self.assertEqual(a.review_status, "unreviewed")
        self.assertTrue(any(f.code == "rules_unreviewed" for f in a.flags))

    def test_knots_reported(self):
        a = evaluate("windsurf", "beginner", obs(wind=18.52), RULES)
        self.assertEqual(a.inputs["wind_knots"], 10.0)

    def test_no_verdict_language_anywhere(self):
        scenarios = [
            evaluate("windsurf", "beginner", obs(wind=12), RULES, sectors=SECTORS),
            evaluate("windsurf", "beginner", obs(wind=40), RULES, sectors=SECTORS),
            evaluate("windsurf", "beginner", obs(wind=2), RULES, sectors=SECTORS),
            evaluate("windsurf", "beginner", obs(frm=350), RULES, sectors=SECTORS),
            evaluate("windsurf", "beginner", obs(lightning=calm_lightning(strikes=2, nearest=3.0)), RULES),
            evaluate("windsurf", "beginner", obs(lightning=None), RULES),
            evaluate("windsurf", "beginner", obs(wind=None), RULES),
            evaluate("windsurf", "expert", obs(), RULES),
            evaluate("wakesurf", "beginner", obs(wind=None, age=None), [], wind_dependent=False),
        ]
        for a in scenarios:
            text = all_text(a).lower()
            for pattern in BANNED:
                self.assertIsNone(re.search(pattern, text), f"{pattern!r} found in: {text}")

    def test_to_dict_is_serialisable(self):
        import json
        a = evaluate("windsurf", "beginner", obs(), RULES, sectors=SECTORS)
        json.dumps(a.to_dict())


if __name__ == "__main__":
    unittest.main()
