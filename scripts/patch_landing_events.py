#!/usr/bin/env python3
"""
Tags the landing pages' links so that pressing them is counted (after a visitor accepts analytics).

    python3 scripts/patch_landing_events.py ~/my_code/wsk-landing --dry-run
    python3 scripts/patch_landing_events.py ~/my_code/wsk-landing \\
        --early-access-url https://forms.gle/xxxx --feedback-url https://forms.gle/yyyy

It adds data-wsk-event="..." to links, and nothing else:
  - links to chat.whatsapp.com          -> whatsapp_join_clicked
  - links into the app (/app/...)       -> conditions_cta_clicked
  - links to the partners page          -> partners_link_clicked
  - links to instagram.com              -> instagram_link_clicked
  - the link you name with --early-access-url  -> early_access_form_clicked
  - the link you name with --feedback-url      -> feedback_link_clicked
Other Google Form links are left alone and listed, because forms look the same from the address, and a wrong label
would give you wrong numbers. Copy each form's address from the dry run, next to the link text you recognise.
It skips links that already have the attribute, so running it twice changes nothing.
"""
import re
import sys
from pathlib import Path

PAGES = ["index.html", "operators.html", "privacy.html"]
ANCHOR = re.compile(r"<a\b([^>]*)>(.*?)</a>", re.S | re.I)
HREF = re.compile(r"""\bhref\s*=\s*(["'])(.*?)\1""", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
SKIP = re.compile(r"(<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->)", re.S | re.I)


def event_for(href: str, early_access_url: str, feedback_url: str = ""):
    h = href.strip()
    if "chat.whatsapp.com" in h:
        return "whatsapp_join_clicked"
    if re.match(r"^https?://(www\.)?instagram\.com/", h):
        return "instagram_link_clicked"
    if h == "/operators.html" or h.startswith("/operators.html#") or h.startswith("https://www.watersportskaki.sg/operators.html"):
        return "partners_link_clicked"
    if h == "/app" or h.startswith("/app/") or h.startswith("/app?") or h.startswith("https://www.watersportskaki.sg/app"):
        return "conditions_cta_clicked"
    if early_access_url and h.rstrip("/") == early_access_url.rstrip("/"):
        return "early_access_form_clicked"
    if feedback_url and h.rstrip("/") == feedback_url.rstrip("/"):
        return "feedback_link_clicked"
    return None


def is_form(href: str) -> bool:
    return "forms.gle/" in href or "docs.google.com/forms" in href


def patch(html: str, early_access_url: str = "", feedback_url: str = ""):
    """(new_html, tagged, untagged_forms). tagged: [(event, href, text)]. untagged_forms: [(href, text)]."""
    tagged, forms = [], []

    def repl(m):
        attrs, inner = m.group(1), m.group(2)
        hm = HREF.search(attrs)
        if not hm:
            return m.group(0)
        href = hm.group(2)
        text = " ".join(TAG.sub("", inner).split())[:60]
        if "data-wsk-event" in attrs:
            return m.group(0)
        ev = event_for(href, early_access_url, feedback_url)
        if ev:
            tagged.append((ev, href, text))
            return f'<a data-wsk-event="{ev}"{attrs}>{inner}</a>'
        if is_form(href):
            forms.append((href, text))
        return m.group(0)

    # Only the page's own markup is changed. Scripts, styles and comments are left exactly as they are: a link written inside
    # a JavaScript string could be broken by an added attribute.
    parts = SKIP.split(html)
    for i in range(0, len(parts), 2):
        parts[i] = ANCHOR.sub(repl, parts[i])
    return "".join(parts), tagged, forms


def main(argv):
    dry = "--dry-run" in argv
    early = feedback = ""
    args = []
    it = iter(argv)
    for a in it:
        if a == "--early-access-url":
            early = next(it, "")
        elif a == "--feedback-url":
            feedback = next(it, "")
        elif not a.startswith("--"):
            args.append(a)
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
        after, tagged, forms = patch(before, early, feedback)
        print(f"{name}:")
        for ev, href, text in tagged:
            print(f"  + {ev:26} {text!r} -> {href}")
        for href, text in forms:
            print(f"  ? form link left alone: {text!r} -> {href}")
        if not tagged and not forms:
            print("  (nothing to tag)")
        if after != before:
            changed += 1
            if not dry:
                path.write_text(after, encoding="utf-8")
    print(f"\n{changed} file(s) {'would change' if dry else 'changed'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
