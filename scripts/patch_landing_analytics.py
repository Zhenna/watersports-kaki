#!/usr/bin/env python3
"""
Adds the analytics script tag and the "Analytics choices" footer link to the landing pages.

    python3 scripts/patch_landing_analytics.py ~/my_code/wsk-landing            make the changes
    python3 scripts/patch_landing_analytics.py ~/my_code/wsk-landing --dry-run  only say what it would do

For each of index.html, operators.html and privacy.html it:
  1. puts <script type="module" src="/app/analytics.js"></script> just before </head>
  2. puts an "Analytics choices" link on the line after the footer "Privacy" link
It skips anything already there, so running it twice changes nothing. It never touches anything else in the file,
and it only prints a warning if it can't find a place. Check the result with git diff.
"""
import re
import sys
from pathlib import Path

PAGES = ["index.html", "operators.html", "privacy.html"]
SCRIPT_TAG = '<script type="module" src="/app/analytics.js"></script>'
LINK = '<a href="#" data-wsk-consent-settings>Analytics choices</a>'
PRIVACY_LINK = re.compile(r'^(?P<indent>[ \t]*)<a href="/privacy\.html"[^>]*>Privacy</a>[ \t]*$', re.M)


def patch(html: str):
    """(new_html, notes). notes is a list of what was done or why not."""
    notes = []
    out = html

    if "/app/analytics.js" in out:
        notes.append("script tag already there")
    elif out.count("</head>") != 1:
        notes.append(f"WARNING: found {out.count('</head>')} </head> tags, so I left the script tag out")
    else:
        out = out.replace("</head>", f"{SCRIPT_TAG}\n</head>", 1)
        notes.append("added the script tag before </head>")

    if "data-wsk-consent-settings" in out:
        notes.append("Analytics choices link already there")
    else:
        matches = list(PRIVACY_LINK.finditer(out))
        if not matches:
            notes.append('WARNING: no footer line with only the "Privacy" link, so I left the Analytics choices link out')
        else:
            m = matches[-1]                                 # the footer is the last one on the page
            out = out[:m.end()] + f"\n{m.group('indent')}{LINK}" + out[m.end():]
            notes.append("added the Analytics choices link after the Privacy link")
    return out, notes


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    dry = "--dry-run" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    root = Path(args[0]).expanduser()
    if not root.is_dir():
        print(f"Not a folder: {root}")
        return 2
    changed = 0
    for name in PAGES:
        path = root / name
        if not path.is_file():
            print(f"{name}: not found, skipped")
            continue
        before = path.read_text(encoding="utf-8")
        after, notes = patch(before)
        print(f"{name}:")
        for n in notes:
            print(f"  - {n}")
        if after != before:
            changed += 1
            if not dry:
                path.write_text(after, encoding="utf-8")
    print(f"\n{changed} file(s) {'would change' if dry else 'changed'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
