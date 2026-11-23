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


PAIN = """<a href="https://forms.gle/early1">\u26c5 I don't know when conditions are suitable for me</a>
<a href="https://forms.gle/early1">\U0001F465 I can't find people to go with</a>
<a href="https://forms.gle/early1">\U0001F9ED I want to try a new watersport but don't know where to start</a>
<a href="https://forms.gle/early1">\U0001F4C8 I want to learn and find other beginners</a>
<a href="https://forms.gle/early1">\U0001F4C5 Getting everyone to the same place at the same time is hard</a>
<a href="https://forms.gle/early1">\U0001F30A I want to track my progress and time on the water</a>
<a href="https://forms.gle/early1">\U0001F4AC Something else</a>
<a href="https://forms.gle/early1">Join early access \u2192</a>
<a href="https://forms.gle/early1">Tell us what you\u2019d like next.</a>
<a href="https://forms.gle/early1">An unrecognised button</a>
<a href="https://forms.gle/partner1">Join the partner network \u2192</a>
"""


class Choices(unittest.TestCase):
    def test_each_early_access_button_gets_its_own_label(self):
        out, tagged, _ = pe.patch(PAIN, "https://forms.gle/early1", partner_url="https://forms.gle/partner1")
        labels = [l.split('data-wsk-choice="')[1].split('"')[0] for l in out.splitlines() if "data-wsk-choice" in l]
        self.assertEqual(labels, ["unsure_when_to_go", "no_people_to_go_with", "unsure_where_to_start", "learn_with_beginners",
                                  "coordinating_groups", "track_progress", "something_else", "join_button", "next_sport"])
        self.assertEqual(len(set(labels)), len(labels))
        self.assertTrue(all(v.islower() and v.replace("_", "").isalpha() for v in labels))

    def test_an_unrecognised_button_is_tagged_without_a_label(self):
        out, _, _ = pe.patch(PAIN, "https://forms.gle/early1")
        line = [l for l in out.splitlines() if "unrecognised" in l][0]
        self.assertIn('data-wsk-event="early_access_form_clicked"', line)
        self.assertNotIn("data-wsk-choice", line)

    def test_only_early_access_links_get_a_label(self):
        out, _, _ = pe.patch(PAIN, "https://forms.gle/early1", partner_url="https://forms.gle/partner1")
        partner = [l for l in out.splitlines() if "partner network" in l][0]
        self.assertIn('data-wsk-event="partner_form_clicked"', partner)
        self.assertNotIn("data-wsk-choice", partner)

    def test_the_partner_form_is_tagged_only_when_named(self):
        _, tagged, forms = pe.patch(PAIN, "https://forms.gle/early1")
        self.assertNotIn("partner_form_clicked", [t[0] for t in tagged])
        self.assertIn(("https://forms.gle/partner1", "Join the partner network \u2192"), forms)

    def test_running_it_twice_changes_nothing_even_with_labels(self):
        once, _, _ = pe.patch(PAIN, "https://forms.gle/early1", partner_url="https://forms.gle/partner1")
        twice, tagged, _ = pe.patch(once, "https://forms.gle/early1", partner_url="https://forms.gle/partner1")
        self.assertEqual(once, twice)
        self.assertEqual(tagged, [])

    def test_a_curly_apostrophe_is_understood(self):
        self.assertEqual(pe.choice_for("Tell us what you\u2019d like next."), "next_sport")
        self.assertEqual(pe.choice_for("\U0001F465 I can\u2019t find people to go with"), "no_people_to_go_with")
        self.assertIsNone(pe.choice_for(""))


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
