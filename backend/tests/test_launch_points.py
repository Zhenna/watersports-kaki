import unittest
from types import SimpleNamespace as NS

from services.launch_points import select_launch_point

WS, OTHER = "act-windsurf", "act-sup"


def row(**over):
    base = dict(activity_id=WS, name="PAssion WaVe @ East Coast launch", lat=1.311285, lng=103.952722,
                shore_bearing_deg=75.0, sea_bearing_deg=165.0, note="n", reviewed_by=None)
    base.update(over)
    return NS(**base)


class SelectLaunchPoint(unittest.TestCase):
    def test_unreviewed_hidden_unless_allowed(self):
        self.assertIsNone(select_launch_point([row()], WS, False))
        got = select_launch_point([row()], WS, True)
        self.assertEqual(got["shore_bearing_deg"], 75.0)
        self.assertEqual(got["review_status"], "unreviewed")

    def test_reviewed_is_shown_without_the_flag(self):
        got = select_launch_point([row(reviewed_by="Coach A")], WS, False)
        self.assertEqual(got["review_status"], "reviewed")

    def test_other_activity_never_matches(self):
        self.assertIsNone(select_launch_point([row(activity_id=OTHER)], WS, True))

    def test_all_activities_row_matches(self):
        self.assertIsNotNone(select_launch_point([row(activity_id=None)], WS, True))

    def test_exact_activity_beats_all_activities(self):
        rows = [row(activity_id=None, name="Generic"), row(name="Specific")]
        self.assertEqual(select_launch_point(rows, WS, True)["name"], "Specific")

    def test_reviewed_beats_unreviewed(self):
        rows = [row(name="Draft"), row(name="Signed", reviewed_by="Coach A")]
        self.assertEqual(select_launch_point(rows, WS, True)["name"], "Signed")

    def test_no_rows(self):
        self.assertIsNone(select_launch_point([], WS, True))
        self.assertIsNone(select_launch_point(None, WS, True))

    def test_bad_numbers_are_skipped_not_shown(self):
        bad = [
            row(shore_bearing_deg=None), row(sea_bearing_deg=float("nan")), row(lat=95.0), row(lng=200.0),
            row(shore_bearing_deg=400.0), row(sea_bearing_deg=-1.0),
            row(sea_bearing_deg=75.0),    # sea along the shore, not across it
            row(sea_bearing_deg=120.0),   # 45 degrees, not about 90
        ]
        for r in bad:
            self.assertIsNone(select_launch_point([r], WS, True), vars(r))

    def test_sea_may_be_either_side_of_the_shore(self):
        self.assertIsNotNone(select_launch_point([row(sea_bearing_deg=345.0)], WS, True))

    def test_the_measured_numbers_pass(self):
        got = select_launch_point([row()], WS, True)
        self.assertEqual((got["lat"], got["lng"]), (1.311285, 103.952722))
        self.assertEqual(got["sea_bearing_deg"], 165.0)


if __name__ == "__main__":
    unittest.main()
