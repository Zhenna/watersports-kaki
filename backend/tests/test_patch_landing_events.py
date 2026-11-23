import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "patch_landing_events.py"
spec = importlib.util.spec_from_file_location("patch_landing_events", SCRIPT)
pe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pe)

PAGE = """<nav>
  <a href="/app/" class="btn">Check windsurfing conditions</a>
  <a href="https://chat.whatsapp.com/ABC123" target="_blank" rel="noopener">Join WhatsApp community</a>
  <a href='https://forms.gle/early1' class='cta'>I'm <b>interested</b></a>
  <a href="https://forms.gle/feedback1">Give Feedback</a>
  <a href="https://docs.google.com/forms/d/e/partner/viewform">For partners</a>
  <a href="https://instagram.com/x">Instagram</a>
  <a href="https://example.org/page">Some other site</a>
  <a name="top">no href</a>
</nav>
<script>var s = '<a href="https://chat.whatsapp.com/IN-A-SCRIPT">x</a>';</script>
"""


class Patch(unittest.TestCase):
    def test_whatsapp_and_the_app_link_are_tagged(self):
        out, tagged, _ = pe.patch(PAGE)
        self.assertIn('<a data-wsk-event="whatsapp_join_clicked" href="https://chat.whatsapp.com/ABC123"', out)
        self.assertIn('<a data-wsk-event="conditions_cta_clicked" href="/app/" class="btn">', out)
        self.assertEqual({t[0] for t in tagged}, {"whatsapp_join_clicked", "conditions_cta_clicked", "instagram_link_clicked"})

    def test_forms_are_only_tagged_when_you_name_the_early_access_one(self):
        out, tagged, forms = pe.patch(PAGE)
        self.assertEqual(len([t for t in tagged if t[0] == "early_access_form_clicked"]), 0)
        self.assertEqual(len(forms), 3)                                          # all three forms are listed, none tagged
        out2, tagged2, forms2 = pe.patch(PAGE, "https://forms.gle/early1")
        self.assertIn("data-wsk-event=\"early_access_form_clicked\" href='https://forms.gle/early1'", out2)
        self.assertEqual(len(forms2), 2)                                         # feedback and partner stay untagged
        self.assertNotIn('data-wsk-event="early_access_form_clicked" href="https://forms.gle/feedback1"', out2)

    def test_the_early_access_url_must_match_exactly(self):
        _, tagged, _ = pe.patch(PAGE, "https://forms.gle/early")                 # a prefix of another link
        self.assertEqual([t for t in tagged if t[0] == "early_access_form_clicked"], [])

    def test_other_links_and_non_links_are_untouched(self):
        out, _, _ = pe.patch(PAGE)
        self.assertIn('<a href="https://example.org/page">Some other site</a>', out)
        self.assertIn('<a name="top">no href</a>', out)

    def test_link_text_with_markup_is_read_as_plain_text(self):
        _, _, forms = pe.patch(PAGE)
        self.assertIn(("https://forms.gle/early1", "I'm interested"), forms)

    def test_running_it_twice_changes_nothing(self):
        once, _, _ = pe.patch(PAGE, "https://forms.gle/early1")
        twice, tagged, _ = pe.patch(once, "https://forms.gle/early1")
        self.assertEqual(once, twice)
        self.assertEqual(tagged, [])

    def test_an_existing_tag_is_never_overwritten(self):
        page = '<a href="https://chat.whatsapp.com/X" data-wsk-event="home_link_clicked">x</a>'
        out, tagged, _ = pe.patch(page)
        self.assertEqual(out, page)
        self.assertEqual(tagged, [])

    def test_only_the_tag_is_added(self):
        import re
        out, _, _ = pe.patch(PAGE, "https://forms.gle/early1", "https://forms.gle/feedback1")
        self.assertNotEqual(out, PAGE)
        self.assertEqual(re.sub(r' ?data-wsk-event="[a-z_]+"', "", out).replace("<a  ", "<a ").replace("<a>", "<a>"), PAGE.replace("<a ", "<a "))

    def test_instagram_partners_and_feedback_are_tagged(self):
        out, tagged, forms = pe.patch(PAGE, "https://forms.gle/early1", "https://forms.gle/feedback1")
        events = {t[0] for t in tagged}
        self.assertIn("instagram_link_clicked", events)
        self.assertIn("feedback_link_clicked", events)
        self.assertIn('data-wsk-event="feedback_link_clicked" href="https://forms.gle/feedback1"', out)
        page = '<a href="/operators.html">For partners</a><a href="https://evil.example/operators.html">x</a><a href="https://instagram.com.evil.example/x">y</a>'
        out2, tagged2, _ = pe.patch(page)
        self.assertEqual([t[0] for t in tagged2], ["partners_link_clicked"])
        self.assertEqual(out2.count("data-wsk-event"), 1)

    def test_app_links_of_other_shapes(self):
        for href, expect in [("/app", True), ("/app/?level=never_tried", True), ("/app?x=1", True), ("https://www.watersportskaki.sg/app/", True),
                             ("/application", False), ("/apps/", False), ("https://evil.example/app/", False)]:
            self.assertEqual(pe.event_for(href, "") == "conditions_cta_clicked", expect, href)


class LeavesCodeAlone(unittest.TestCase):
    def test_links_inside_scripts_styles_and_comments_are_never_changed(self):
        page = ("<script>var a = \"<a href='https://chat.whatsapp.com/S1'>x</a>\"; var b = '<a href=\"/app/\">y</a>';</script>"
                "<style>/* <a href=\"/app/\"> */ a{color:red}</style>"
                "<!-- <a href=\"https://chat.whatsapp.com/C1\">old</a> -->"
                "<a href=\"https://chat.whatsapp.com/REAL\">real</a>")
        out, tagged, _ = pe.patch(page)
        self.assertEqual(len(tagged), 1)
        self.assertEqual(tagged[0][1], "https://chat.whatsapp.com/REAL")
        self.assertEqual(out.count("data-wsk-event"), 1)
        self.assertTrue(out.startswith(page[: page.index('<a href="https://chat.whatsapp.com/REAL">')]))   # everything before the real link is identical

    def test_a_script_with_a_closing_tag_in_uppercase_is_still_skipped(self):
        page = "<SCRIPT>x = '<a href=\"/app/\">';</SCRIPT><a href=\"/app/\">go</a>"
        out, tagged, _ = pe.patch(page)
        self.assertEqual(len(tagged), 1)
        self.assertIn("<SCRIPT>x = '<a href=\"/app/\">';</SCRIPT>", out)


class Folder(unittest.TestCase):
    def test_dry_run_writes_nothing_and_a_real_run_writes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "index.html").write_text(PAGE, encoding="utf-8")
            self.assertEqual(pe.main([d, "--dry-run"]), 0)
            self.assertEqual((root / "index.html").read_text(encoding="utf-8"), PAGE)
            self.assertEqual(pe.main([d, "--early-access-url", "https://forms.gle/early1"]), 0)
            self.assertIn('data-wsk-event="early_access_form_clicked"', (root / "index.html").read_text(encoding="utf-8"))
            self.assertFalse((root / "operators.html").exists())

    def test_a_bad_folder_or_no_argument_does_nothing(self):
        self.assertEqual(pe.main(["/no/such/folder"]), 2)
        self.assertEqual(pe.main([]), 2)


if __name__ == "__main__":
    unittest.main()
