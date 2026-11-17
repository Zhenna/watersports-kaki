import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "patch_landing_analytics.py"
spec = importlib.util.spec_from_file_location("patch_landing_analytics", SCRIPT)
pl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pl)

PAGE = """<!DOCTYPE html>
<html><head>
<title>x</title>
</head>
<body>
<p class="footer-note">See the <a href="/privacy.html" style="color:inherit">Privacy notice</a>.</p>
<footer>
  <div class="footer-links">
      <a href="https://instagram.com/x">@x</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/operators.html">For partners</a>
  </div>
</footer>
</body></html>
"""


class Patch(unittest.TestCase):
    def test_adds_the_script_before_head_and_the_link_after_privacy(self):
        out, notes = pl.patch(PAGE)
        self.assertIn(f'{pl.SCRIPT_TAG}\n</head>', out)
        self.assertIn('      <a href="/privacy.html">Privacy</a>\n      ' + pl.LINK + '\n      <a href="/operators.html">', out)
        self.assertEqual(len(notes), 2)

    def test_nothing_else_changes(self):
        out, _ = pl.patch(PAGE)
        removed = [l for l in PAGE.splitlines() if l not in out.splitlines()]
        self.assertEqual(removed, [])
        added = [l for l in out.splitlines() if l not in PAGE.splitlines()]
        self.assertEqual(sorted(a.strip() for a in added), sorted([pl.SCRIPT_TAG, pl.LINK]))

    def test_running_it_twice_changes_nothing(self):
        once, _ = pl.patch(PAGE)
        twice, notes = pl.patch(once)
        self.assertEqual(once, twice)
        self.assertTrue(all("already there" in n for n in notes))

    def test_the_inline_privacy_notice_link_is_not_mistaken_for_the_footer(self):
        out, _ = pl.patch(PAGE)
        self.assertEqual(out.count(pl.LINK), 1)
        self.assertNotIn('Privacy notice</a>.</p>\n      <a href="#"', out)
        self.assertLess(out.index("Privacy notice"), out.index(pl.LINK))

    def test_no_footer_privacy_link_adds_the_script_only_and_warns(self):
        page = PAGE.replace('<a href="/privacy.html">Privacy</a>', "")
        out, notes = pl.patch(page)
        self.assertIn(pl.SCRIPT_TAG, out)
        self.assertNotIn(pl.LINK, out)
        self.assertTrue(any("WARNING" in n and "Privacy" in n for n in notes))

    def test_a_page_without_one_head_is_left_alone_and_warns(self):
        for page in ("<html><body><footer>\n<a href=\"/privacy.html\">Privacy</a>\n</footer></body></html>", PAGE.replace("</head>", "</head></head>")):
            out, notes = pl.patch(page)
            self.assertNotIn(pl.SCRIPT_TAG, out)
            self.assertTrue(any("WARNING" in n and "</head>" in n for n in notes))

    def test_a_page_that_already_has_both_is_unchanged(self):
        page = PAGE.replace("</head>", pl.SCRIPT_TAG + "\n</head>").replace("<footer>", "<footer>" + pl.LINK)
        out, _ = pl.patch(page)
        self.assertEqual(out, page)

    def test_the_last_privacy_line_is_used_when_there_are_two(self):
        page = PAGE.replace("<body>", '<body>\n<nav>\n  <a href="/privacy.html">Privacy</a>\n</nav>')
        out, _ = pl.patch(page)
        self.assertEqual(out.count(pl.LINK), 1)
        self.assertGreater(out.index(pl.LINK), out.index("For partners") - 200)


class Folder(unittest.TestCase):
    def test_files_are_written_and_a_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "index.html").write_text(PAGE, encoding="utf-8")
            (root / "privacy.html").write_text(PAGE, encoding="utf-8")        # operators.html is missing on purpose
            self.assertEqual(pl.main([d, "--dry-run"]), 0)
            self.assertEqual((root / "index.html").read_text(encoding="utf-8"), PAGE)
            self.assertEqual(pl.main([d]), 0)
            self.assertIn(pl.SCRIPT_TAG, (root / "index.html").read_text(encoding="utf-8"))
            self.assertIn(pl.LINK, (root / "privacy.html").read_text(encoding="utf-8"))
            self.assertFalse((root / "operators.html").exists())

    def test_a_bad_folder_or_no_argument_does_nothing(self):
        self.assertEqual(pl.main(["/no/such/folder"]), 2)
        self.assertEqual(pl.main([]), 2)


if __name__ == "__main__":
    unittest.main()
