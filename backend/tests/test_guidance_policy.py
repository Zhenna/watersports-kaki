import os
import sys
import unittest
from types import SimpleNamespace as NS
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.conditions_rules import WindSector, classify_direction  # noqa: E402
from services.guidance_policy import preview_mode, provisional_guidance, select_sectors  # noqa: E402


def with_env(**env):
    return mock.patch.dict(os.environ, env, clear=False)


class TestSwitches(unittest.TestCase):
    def setUp(self):
        for name in ("WSK_SHOW_PRIVATE_SPOTS", "WSK_PROVISIONAL_GUIDANCE"):
            os.environ.pop(name, None)

    def test_both_are_off_by_default(self):
        self.assertFalse(preview_mode())
        self.assertFalse(provisional_guidance())

    def test_each_turns_on_only_with_exactly_1(self):
        with with_env(WSK_PROVISIONAL_GUIDANCE="1"):
            self.assertTrue(provisional_guidance())
        for value in ("0", "true", "yes", "", "2"):
            with with_env(WSK_PROVISIONAL_GUIDANCE=value):
                self.assertFalse(provisional_guidance(), value)

    def test_they_are_independent(self):
        with with_env(WSK_PROVISIONAL_GUIDANCE="1"):
            self.assertFalse(preview_mode(), "provisional guidance must not reveal private spots")
        with with_env(WSK_SHOW_PRIVATE_SPOTS="1"):
            self.assertFalse(provisional_guidance())


ACT = "windsurf-id"
ROWS = [
    NS(from_deg=120, to_deg=210, direction_class="onshore", activity_id=None, reviewed_by=None),
    NS(from_deg=300, to_deg=30, direction_class="offshore", activity_id=None, reviewed_by="Instructor"),
    NS(from_deg=0, to_deg=90, direction_class="cross_shore", activity_id="other-id", reviewed_by="Instructor"),
    NS(from_deg=90, to_deg=120, direction_class="cross_shore", activity_id=ACT, reviewed_by=None),
]


class TestSelectSectors(unittest.TestCase):
    def test_only_reviewed_sectors_by_default(self):
        got = select_sectors(ROWS, ACT, allow_unreviewed=False)
        self.assertEqual([(s.from_deg, s.direction_class) for s in got], [(300, "offshore")])

    def test_unreviewed_sectors_when_allowed(self):
        got = select_sectors(ROWS, ACT, allow_unreviewed=True)
        self.assertEqual(sorted((s.from_deg, s.direction_class) for s in got),
                         [(90, "cross_shore"), (120, "onshore"), (300, "offshore")])

    def test_another_activitys_sectors_are_never_used(self):
        got = select_sectors(ROWS, ACT, allow_unreviewed=True)
        self.assertNotIn(0, [s.from_deg for s in got])


# the sectors in the East Coast migration, as the engine will read them
EAST_COAST = [
    WindSector(300, 30, "offshore"),
    WindSector(30.001, 120, "cross_shore"),
    WindSector(120.001, 209.999, "onshore"),
    WindSector(210, 299.999, "cross_shore"),
]


class TestProvisionalEastCoastSectors(unittest.TestCase):
    def cls(self, deg):
        return classify_direction(deg, EAST_COAST)

    def test_the_middle_of_each_band(self):
        self.assertEqual(self.cls(345), "offshore")
        self.assertEqual(self.cls(75), "cross_shore")
        self.assertEqual(self.cls(165), "onshore")
        self.assertEqual(self.cls(255), "cross_shore")

    def test_the_wind_in_the_live_reading_was_from_the_north(self):
        self.assertEqual(self.cls(357), "offshore")

    def test_boundaries_go_to_the_more_cautious_class(self):
        self.assertEqual(self.cls(300), "offshore")
        self.assertEqual(self.cls(30), "offshore")
        self.assertEqual(self.cls(120), "cross_shore")
        self.assertEqual(self.cls(210), "cross_shore")

    def test_every_whole_degree_has_exactly_one_class(self):
        for d in range(0, 360):
            hits = [s for s in EAST_COAST
                    if (s.from_deg <= d <= s.to_deg if s.from_deg <= s.to_deg else (d >= s.from_deg or d <= s.to_deg))]
            self.assertEqual(len(hits), 1, d)

    def test_a_decimal_just_inside_each_edge(self):
        self.assertEqual(self.cls(30.5), "cross_shore")
        self.assertEqual(self.cls(120.5), "onshore")
        self.assertEqual(self.cls(209.5), "onshore")
        self.assertEqual(self.cls(299.5), "cross_shore")
        self.assertEqual(self.cls(359.9), "offshore")


if __name__ == "__main__":
    unittest.main()
