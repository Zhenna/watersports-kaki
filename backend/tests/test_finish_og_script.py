import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "finish_og.sh"

# A stand-in for macOS's sips, so the script's own checks can be tested anywhere.
# A "picture" here is a text file whose first line is "WIDTH HEIGHT", followed by padding that sets its size.
FAKE_SIPS = r'''#!/usr/bin/env python3
import sys
a = sys.argv[1:]
if a[0] == "-g":
    prop, path = a[1], a[2]
    try:
        w, h = open(path).readline().split()[:2]
    except Exception:
        sys.exit(1)
    print(path)
    print("  %s: %s" % (prop, w if prop == "pixelWidth" else h))
elif a[0] == "-c":
    h, w, path = int(a[1]), int(a[2]), a[3]
    first, _, rest = open(path).read().partition("\n")
    open(path, "w").write("%d %d\n%s" % (w, h, rest))
elif a[0] == "--resampleWidth":
    width, src, out = int(a[1]), a[2], a[a.index("--out") + 1]
    first, _, rest = open(src).read().partition("\n")
    w, h = map(int, first.split()[:2])
    open(out, "w").write("%d %d\n%s" % (width, round(h * width / w), rest))
'''


class FinishOg(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "scripts").mkdir()
        (self.tmp / "frontend").mkdir()
        (self.tmp / "bin").mkdir()
        shutil.copy(SCRIPT, self.tmp / "scripts" / "finish_og.sh")
        sips = self.tmp / "bin" / "sips"
        sips.write_text(FAKE_SIPS)
        sips.chmod(sips.stat().st_mode | stat.S_IEXEC)
        self.env = dict(os.environ, PATH=f"{self.tmp / 'bin'}:{os.environ['PATH']}")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def picture(self, name, w, h, size=2000):
        p = self.tmp / name
        header = f"{w} {h}\n"
        p.write_text(header + "x" * (size - len(header)))
        return p

    def run_script(self, *args):
        return subprocess.run(["bash", str(self.tmp / "scripts" / "finish_og.sh"), *map(str, args)],
                              capture_output=True, text=True, env=self.env)

    def out(self, version):
        return self.tmp / "frontend" / f"og-app-{version}.png"

    def test_a_retina_screenshot_is_scaled_to_exactly_1200_by_630_and_saved_under_the_right_name(self):
        r = self.run_script(self.picture("shot.png", 2400, 1260), "light")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(self.out("light").exists())
        self.assertEqual(self.out("light").read_text().splitlines()[0], "1200 630")
        self.assertIn("1200 by 630", r.stdout)
        self.assertFalse(self.out("dark").exists())

    def test_a_normal_size_screenshot_is_kept_at_1200_by_630(self):
        r = self.run_script(self.picture("shot.png", 1200, 630), "dark")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.out("dark").read_text().splitlines()[0], "1200 630")
        self.assertFalse(self.out("light").exists())

    def test_any_larger_scale_of_the_right_shape_is_accepted_such_as_your_1920_by_1008(self):
        for w, h in ((1920, 1008), (1800, 945), (1600, 840), (1500, 788), (3600, 1890), (2880, 1512)):
            with self.subTest(size=(w, h)):
                r = self.run_script(self.picture("shot.png", w, h), "light")
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                self.assertEqual(self.out("light").read_text().splitlines()[0], "1200 630")
                self.out("light").unlink()

    def test_a_capture_a_pixel_too_tall_at_an_odd_scale_is_trimmed_too(self):
        r = self.run_script(self.picture("shot.png", 1920, 1009), "dark")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.out("dark").read_text().splitlines()[0], "1200 630")
        self.assertIn("Trimmed 1 extra pixel row", r.stdout)

    def test_the_right_shape_but_smaller_than_1200_is_refused_with_advice_about_zoom(self):
        for w, h in ((600, 315), (1000, 525), (1199, 629)):
            with self.subTest(size=(w, h)):
                r = self.run_script(self.picture("small.png", w, h), "light")
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertIn("smaller than 1200 by 630", r.stdout)
                self.assertIn("zoom", r.stdout)
                self.assertFalse(self.out("light").exists())

    def test_a_capture_a_pixel_too_tall_is_trimmed_to_exactly_630(self):
        for w, h in ((2400, 1261), (2400, 1262), (1200, 631), (1201, 631), (2401, 1260)):
            with self.subTest(size=(w, h)):
                r = self.run_script(self.picture("shot.png", w, h), "light")
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                self.assertEqual(self.out("light").read_text().splitlines()[0], "1200 630")
                self.out("light").unlink()

    def test_a_capture_that_is_too_short_after_scaling_is_refused(self):
        r = self.run_script(self.picture("shot.png", 1200, 628), "light")
        self.assertEqual(r.returncode, 1)
        self.assertFalse(self.out("light").exists())

    def test_a_capture_that_is_more_than_two_pixels_off_is_refused(self):
        for w, h in ((2400, 1266), (1200, 634), (1210, 630), (2400, 1250), (1920, 1020), (1920, 1000)):
            with self.subTest(size=(w, h)):
                r = self.run_script(self.picture("shot.png", w, h), "light")
                self.assertEqual(r.returncode, 1, r.stdout)
                self.assertFalse(self.out("light").exists())

    def test_the_small_heading_above_a_picture_is_recognised_and_explained(self):
        for w, h in ((202, 28), (188, 28)):
            r = self.run_script(self.picture("label.png", w, h), "dark")
            self.assertEqual(r.returncode, 1)
            self.assertIn(f"{w} by {h}", r.stdout)
            self.assertIn("usually means the heading above it", r.stdout)
            self.assertIn('id="dark"', r.stdout)
            self.assertFalse(self.out("dark").exists())

    def test_the_wrong_shape_is_refused_and_nothing_is_saved(self):
        r = self.run_script(self.picture("page.png", 1400, 900), "light")
        self.assertEqual(r.returncode, 1)
        self.assertIn("not the 1200 by 630 shape", r.stdout)
        self.assertIn('id="light"', r.stdout)
        self.assertFalse(self.out("light").exists())

    def test_a_picture_over_300_kb_is_refused_and_not_kept(self):
        r = self.run_script(self.picture("big.png", 2400, 1260, size=350_000), "light")
        self.assertEqual(r.returncode, 1)
        self.assertIn("over 300 KB", r.stdout)
        self.assertIn("Nothing was saved", r.stdout)
        self.assertFalse(self.out("light").exists())

    def test_a_picture_just_under_the_limit_is_kept(self):
        r = self.run_script(self.picture("ok.png", 2400, 1260, size=299_000), "light")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(self.out("light").exists())

    def test_a_word_other_than_light_or_dark_is_refused(self):
        r = self.run_script(self.picture("shot.png", 1200, 630), "blue")
        self.assertEqual(r.returncode, 2)
        self.assertIn("light or dark", r.stdout)
        self.assertEqual(list((self.tmp / "frontend").iterdir()), [])

    def test_a_missing_file_or_missing_arguments_do_nothing(self):
        self.assertEqual(self.run_script(self.tmp / "nope.png", "light").returncode, 2)
        r = self.run_script()
        self.assertEqual(r.returncode, 2)
        self.assertIn("finish_og.sh", r.stdout)
        self.assertEqual(list((self.tmp / "frontend").iterdir()), [])

    def test_it_never_touches_anything_but_the_one_picture(self):
        (self.tmp / "frontend" / "index.html").write_text("keep me")
        self.run_script(self.picture("shot.png", 2400, 1260), "light")
        self.assertEqual((self.tmp / "frontend" / "index.html").read_text(), "keep me")
        self.assertEqual(sorted(p.name for p in (self.tmp / "frontend").iterdir()), ["index.html", "og-app-light.png"])


if __name__ == "__main__":
    unittest.main()
