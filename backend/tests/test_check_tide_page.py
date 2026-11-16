import importlib.util
import unittest
from datetime import datetime
from pathlib import Path

from services import tide_table as tt
from tests.test_tide_table import DEC, NOV, page

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_tide_page.py"
spec = importlib.util.spec_from_file_location("check_tide_page", SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class CheckPage(unittest.TestCase):
    def test_a_good_page_passes(self):
        ok, lines = check.check_html(tt, page(), datetime(2026, 11, 16, 9, 0, tzinfo=tt.SGT))
        self.assertTrue(ok, lines)
        self.assertIn("OK", lines[-1])

    def test_a_table_ending_too_soon_fails(self):
        ok, lines = check.check_html(tt, page(), datetime(2026, 12, 25, 9, 0, tzinfo=tt.SGT))
        self.assertFalse(ok)
        self.assertTrue(any("less than 10 days" in l for l in lines))

    def test_a_changed_layout_fails(self):
        ok, lines = check.check_html(tt, "<html><body>New design</body></html>")
        self.assertFalse(ok)
        self.assertIn("could not read", lines[0])

    def test_numbers_that_fail_the_checks_fail(self):
        broken = NOV.replace("10: 0000 3.0 H, 0537 1.4 L, 1100 3.0 H, 1739 0.4 L", "10: 0000 3.0 H, 1100 3.0 H, 1739 0.4 L")
        ok, lines = check.check_html(tt, page(nov=broken), datetime(2026, 11, 16, 9, 0, tzinfo=tt.SGT))
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main()
