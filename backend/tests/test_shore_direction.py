import unittest

from services.conditions_rules import WindSector
from services.shore_direction import shore_direction

# The provisional East Coast sectors from migration f2c8d51e7b94.
SECTORS = [
    WindSector(300, 30, "offshore"),
    WindSector(30.001, 120, "cross_shore"),
    WindSector(120.001, 209.999, "onshore"),
    WindSector(210, 299.999, "cross_shore"),
]


class ShoreDirection(unittest.TestCase):
    def test_each_class(self):
        self.assertEqual(shore_direction(45, [], SECTORS)["class"], "cross_shore")
        self.assertEqual(shore_direction(165, [], SECTORS)["class"], "onshore")
        self.assertEqual(shore_direction(345, [], SECTORS)["class"], "offshore")
        self.assertEqual(shore_direction(250, [], SECTORS)["class"], "cross_shore")

    def test_boundaries_go_to_the_cautious_class(self):
        self.assertEqual(shore_direction(300, [], SECTORS)["class"], "offshore")
        self.assertEqual(shore_direction(30, [], SECTORS)["class"], "offshore")
        self.assertEqual(shore_direction(120, [], SECTORS)["class"], "cross_shore")
        self.assertEqual(shore_direction(210, [], SECTORS)["class"], "cross_shore")

    def test_wraps_through_north(self):
        self.assertEqual(shore_direction(0, [], SECTORS)["class"], "offshore")
        self.assertEqual(shore_direction(360, [], SECTORS)["class"], "offshore")

    def test_other_stations_in_a_different_class_are_listed_once(self):
        # the live example: Kim Chuan Road 45, Marina Barrage 296, Paya Lebar 306
        got = shore_direction(45, [296, 306], SECTORS)
        self.assertEqual(got["class"], "cross_shore")
        self.assertEqual(got["other_classes"], ["offshore"])
        self.assertEqual(shore_direction(45, [346, 347], SECTORS)["other_classes"], ["offshore"])

    def test_agreeing_stations_add_nothing(self):
        self.assertEqual(shore_direction(45, [60, 100], SECTORS)["other_classes"], [])
        self.assertEqual(shore_direction(45, [], SECTORS)["other_classes"], [])
        self.assertEqual(shore_direction(45, None, SECTORS)["other_classes"], [])

    def test_two_different_classes_among_the_others(self):
        self.assertEqual(shore_direction(45, [170, 320], SECTORS)["other_classes"], ["onshore", "offshore"])

    def test_nothing_to_say_means_no_block(self):
        self.assertIsNone(shore_direction(45, [], []))
        self.assertIsNone(shore_direction(45, [], None))
        self.assertIsNone(shore_direction(None, [], SECTORS))
        self.assertIsNone(shore_direction(float("nan"), [], SECTORS))
        self.assertIsNone(shore_direction(400, [], SECTORS))

    def test_an_unusable_other_reading_is_ignored(self):
        self.assertEqual(shore_direction(45, [None, float("nan"), 400], SECTORS)["other_classes"], [])

    def test_review_status_follows_the_sectors(self):
        self.assertEqual(shore_direction(45, [], SECTORS)["review_status"], "unreviewed")
        self.assertEqual(shore_direction(45, [], SECTORS, True)["review_status"], "reviewed")

    def test_no_advice_in_the_block(self):
        got = shore_direction(345, [], SECTORS)
        self.assertEqual(set(got), {"class", "other_classes", "review_status"})


if __name__ == "__main__":
    unittest.main()
