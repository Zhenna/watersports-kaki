import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "sync_app.sh"
FRONTEND = ROOT / "frontend"


def listed_files():
    """The files the sync script copies, from its `for f in ...; do` line."""
    m = re.search(r"^for f in (.+?); do", SCRIPT.read_text(encoding="utf-8"), re.M)
    return m.group(1).split() if m else []


class SyncList(unittest.TestCase):
    def test_every_listed_file_exists_in_the_frontend_folder(self):
        files = listed_files()
        self.assertGreaterEqual(len(files), 10)
        missing = [f for f in files if not (FRONTEND / f).is_file()]
        self.assertEqual(missing, [], f"the sync script lists files that are not in frontend/: {missing}")

    def test_every_module_the_app_imports_is_in_the_list_so_it_gets_published(self):
        listed = set(listed_files())
        seen, queue = set(), ["app.js"]
        while queue:
            f = queue.pop()
            if f in seen:
                continue
            seen.add(f)
            src = (FRONTEND / f).read_text(encoding="utf-8")
            queue += re.findall(r"""(?:from|import)\s*["']\./([^"']+\.js)["']""", src)
        self.assertGreaterEqual(len(seen), 8)
        self.assertEqual(sorted(seen - listed), [], "the app imports files that the sync script would not copy")
        self.assertIn("analytics.js", listed)             # loaded by its own script tag, not an import

    def test_no_file_is_listed_twice(self):
        files = listed_files()
        self.assertEqual(len(files), len(set(files)))

    def test_the_old_invented_picture_is_gone(self):
        self.assertNotIn("og-image.png", listed_files())
        self.assertFalse((FRONTEND / "og-image.png").exists())

    def test_the_light_picture_is_published_and_the_dark_one_is_kept_for_later(self):
        self.assertIn("og-app-light.png", listed_files())
        self.assertNotIn("og-app-dark.png", listed_files())
        self.assertTrue((FRONTEND / "og-app-dark.png").is_file(), "keep the dark picture in the repo")
        for f in ("og-app-light.png", "og-app-dark.png"):
            data = (FRONTEND / f).read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n", f"{f} is not a PNG")
            self.assertEqual((int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")), (1200, 630), f"{f} is not 1200 by 630")
            self.assertLessEqual(len(data), 300_000, f"{f} is over 300 KB, which WhatsApp may skip")

    def test_the_picture_maker_is_a_tool_and_is_never_copied_to_the_live_site(self):
        self.assertNotIn("og-maker.html", listed_files())

    def test_the_file_count_in_the_deploy_notes_matches_the_list(self):
        notes = (ROOT / "DEPLOY.md").read_text(encoding="utf-8")
        m = re.search(r"copies (\d+) files", notes)
        self.assertIsNotNone(m)
        self.assertEqual(int(m.group(1)), len(listed_files()))


if __name__ == "__main__":
    unittest.main()
