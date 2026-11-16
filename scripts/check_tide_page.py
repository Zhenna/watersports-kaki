#!/usr/bin/env python3
"""
Can we still read NEA's tide page? Run weekly (see .github/workflows/tide-check.yml), or by hand:

    python scripts/check_tide_page.py

Downloads the live page, reads it with backend/services/tide_table.py, runs the same checks the API runs, and
also fails if the table covers fewer than 10 more days. That is the early warning that the layout changed or
NEA has not published the next month. Uses only the standard library.

Exit codes: 0 fine, 1 the page is unreadable or fails its checks, 2 could not download it.
A download failure from a cloud runner is not conclusive: NEA may block data-centre addresses.
"""
import importlib.util
import sys
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

URL = "https://www.nea.gov.sg/corporate-functions/weather/tide-timings"
MIN_DAYS_AHEAD = 10


def load_parser():
    path = Path(__file__).resolve().parent.parent / "backend" / "services" / "tide_table.py"
    spec = importlib.util.spec_from_file_location("tide_table", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["tide_table"] = module
    spec.loader.exec_module(module)
    return module


def check_html(tt, html, now=None):
    """(ok, lines) for a page's HTML. Pure, so it can be tested without the network."""
    now = now or datetime.now(tt.SGT)
    try:
        extremes = tt.parse_tide_page(html, today=now)
    except tt.TideTableError as e:
        return False, [f"FAIL: could not read the page: {e}"]
    lines = [f"Read {len(extremes)} tides, {extremes[0].at:%Y-%m-%d} to {extremes[-1].at:%Y-%m-%d}"]
    problems = tt.validate_extremes(extremes)
    end = tt.coverage_end(extremes)
    if end < now + timedelta(days=MIN_DAYS_AHEAD):
        problems.append(f"the table ends on {end:%Y-%m-%d}, less than {MIN_DAYS_AHEAD} days ahead")
    if problems:
        lines.append(f"FAIL: {len(problems)} problem(s)")
        lines += [f"  - {p}" for p in problems[:10]]
        return False, lines
    lines.append("OK: the table looks right and covers at least "
                 f"{MIN_DAYS_AHEAD} more days.")
    return True, lines


def main():
    tt = load_parser()
    req = urllib.request.Request(URL, headers={"User-Agent": "WaterSportsKaki-check/0.1 (+https://www.watersportskaki.sg)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode("utf-8", "replace")
    except Exception as e:
        print(f"Could not download the page: {type(e).__name__}: {e}")
        return 2
    ok, lines = check_html(tt, html)
    print("\n".join(lines))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
