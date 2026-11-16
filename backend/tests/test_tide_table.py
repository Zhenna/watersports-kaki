import unittest
from datetime import datetime, timedelta, timezone

from services.tide_table import (SGT, Extreme, TideTableError, coverage_end, parse_tide_page, tide_now,
                                 validate_extremes)

# NEA tide timings for Nov and Dec 2026, as read from the page: day: time height H/L, ...
NOV = """
1: 0418 2.6 H, 0905 1.8 L, 1439 2.9 H, 2158 0.5 L
2: 0531 2.4 H, 1011 1.9 L, 1550 2.7 H, 2322 0.7 L
3: 0654 2.4 H, 1152 1.8 L, 1726 2.5 H
4: 0054 0.9 L, 0758 2.5 H, 1339 1.6 L, 1926 2.5 H
5: 0211 0.9 L, 0843 2.6 H, 1448 1.3 L, 2046 2.7 H
6: 0309 1.0 L, 0916 2.7 H, 1533 1.0 L, 2146 2.8 H
7: 0354 1.1 L, 0941 2.8 H, 1609 0.8 L, 2237 2.9 H
8: 0431 1.1 L, 1005 2.9 H, 1641 0.6 L, 2320 3.0 H
9: 0505 1.3 L, 1031 3.0 H, 1709 0.5 L
10: 0000 3.0 H, 0537 1.4 L, 1100 3.0 H, 1739 0.4 L
11: 0039 2.9 H, 0609 1.4 L, 1131 3.0 H, 1811 0.4 L
12: 0118 2.9 H, 0639 1.5 L, 1201 3.0 H, 1845 0.4 L
13: 0158 2.8 H, 0711 1.6 L, 1233 3.0 H, 1922 0.5 L
14: 0235 2.6 H, 0739 1.6 L, 1307 2.9 H, 2001 0.6 L
15: 0315 2.5 H, 0811 1.7 L, 1341 2.8 H, 2045 0.7 L
16: 0358 2.4 H, 0850 1.7 L, 1420 2.7 H, 2137 0.9 L
17: 0450 2.3 H, 0948 1.8 L, 1511 2.6 H, 2241 1.0 L
18: 0554 2.3 H, 1107 1.8 L, 1626 2.4 H, 2346 1.1 L
19: 0656 2.4 H, 1233 1.7 L, 1816 2.3 H
20: 0056 1.2 L, 0743 2.5 H, 1346 1.4 L, 1948 2.4 H
21: 0156 1.2 L, 0822 2.7 H, 1439 1.1 L, 2056 2.6 H
22: 0248 1.3 L, 0856 2.9 H, 1518 0.8 L, 2154 2.8 H
23: 0335 1.3 L, 0928 3.0 H, 1556 0.5 L, 2246 2.9 H
24: 0420 1.4 L, 1001 3.1 H, 1633 0.3 L, 2341 3.0 H
25: 0503 1.5 L, 1039 3.2 H, 1715 0.1 L
26: 0035 3.1 H, 0550 1.6 L, 1120 3.3 H, 1801 0.1 L
27: 0131 3.0 H, 0637 1.7 L, 1205 3.3 H, 1850 0.1 L
28: 0224 3.0 H, 0724 1.8 L, 1252 3.3 H, 1946 0.2 L
29: 0316 2.9 H, 0811 1.8 L, 1345 3.2 H, 2046 0.4 L
30: 0407 2.8 H, 0901 1.8 L, 1443 3.0 H, 2148 0.6 L
"""
DEC = """
1: 0500 2.7 H, 1003 1.8 L, 1548 2.8 H, 2254 0.9 L
2: 0552 2.6 H, 1124 1.7 L, 1709 2.6 H
3: 0005 1.1 L, 0645 2.6 H, 1256 1.5 L, 1856 2.5 H
4: 0118 1.3 L, 0733 2.7 H, 1411 1.3 L, 2033 2.5 H
5: 0226 1.5 L, 0816 2.7 H, 1507 1.0 L, 2145 2.6 H
6: 0320 1.5 L, 0856 2.8 H, 1548 0.8 L, 2241 2.7 H
7: 0405 1.6 L, 0931 2.9 H, 1622 0.6 L, 2326 2.8 H
8: 0443 1.6 L, 1005 3.0 H, 1654 0.5 L
9: 0003 2.8 H, 0516 1.7 L, 1041 3.0 H, 1726 0.5 L
10: 0037 2.8 H, 0548 1.7 L, 1115 3.0 H, 1758 0.5 L
11: 0113 2.8 H, 0620 1.7 L, 1148 3.1 H, 1833 0.5 L
12: 0146 2.8 H, 0650 1.7 L, 1222 3.1 H, 1907 0.6 L
13: 0218 2.7 H, 0724 1.7 L, 1258 3.0 H, 1943 0.6 L
14: 0250 2.7 H, 0758 1.7 L, 1333 3.0 H, 2020 0.7 L
15: 0324 2.7 H, 0837 1.7 L, 1411 2.9 H, 2058 0.8 L
16: 0401 2.6 H, 0926 1.6 L, 1458 2.7 H, 2141 1.0 L
17: 0445 2.6 H, 1026 1.6 L, 1554 2.5 H, 2231 1.1 L
18: 0533 2.6 H, 1133 1.5 L, 1720 2.4 H, 2330 1.3 L
19: 0624 2.7 H, 1243 1.3 L, 1903 2.3 H
20: 0037 1.5 L, 0715 2.7 H, 1348 1.0 L, 2037 2.4 H
21: 0152 1.6 L, 0801 2.8 H, 1443 0.7 L, 2158 2.6 H
22: 0300 1.7 L, 0848 2.9 H, 1531 0.5 L, 2300 2.8 H
23: 0358 1.8 L, 0935 3.1 H, 1618 0.3 L, 2354 3.0 H
24: 0448 1.8 L, 1024 3.2 H, 1705 0.1 L
25: 0045 3.0 H, 0539 1.8 L, 1113 3.3 H, 1758 0.1 L
26: 0133 3.1 H, 0626 1.8 L, 1201 3.4 H, 1852 0.2 L
27: 0216 3.0 H, 0715 1.7 L, 1252 3.4 H, 1946 0.3 L
28: 0258 3.0 H, 0801 1.7 L, 1343 3.3 H, 2037 0.5 L
29: 0335 2.9 H, 0850 1.6 L, 1435 3.1 H, 2126 0.7 L
30: 0407 2.9 H, 0943 1.5 L, 1533 2.9 H, 2211 1.0 L
31: 0443 2.8 H, 1043 1.4 L, 1641 2.6 H, 2301 1.3 L
"""


def days(text):
    out = []
    for line in text.strip().splitlines():
        d, rest = line.split(":", 1)
        rows = [tuple(x.split()) for x in rest.split(",")]
        out.append((int(d), rows))
    return out


def table_html(month, text, merged=True, wrap=False):
    cell = (lambda s: f"<td><span>{s}</span></td>") if wrap else (lambda s: f"<td>{s}</td>")
    html = [f"<table><thead><tr><th>{month}</th><th colspan='3'>Tide</th></tr>"
            "<tr><th></th><th>Time</th><th>Height</th><th>H/L</th></tr></thead><tbody>"]
    for d, rows in days(text):
        for i, (t, h, k) in enumerate(rows):
            if merged:
                first = f'<td rowspan="{len(rows)}">{d}</td>' if i == 0 else ""
            else:
                first = f"<td>{d if i == 0 else ''}</td>"
            html.append(f"<tr>{first}{cell(t)}{cell(h)}{cell(k)}</tr>")
    html.append("</tbody></table>")
    return "".join(html)


def page(tabs="Nov 2026 Dec 2026", merged=True, wrap=False, nov=NOV, dec=DEC):
    return (f"<html><body><h1>Tide Timings</h1><ul><li><a>{tabs.split()[0]} {tabs.split()[1]}</a></li>"
            f"<li><a>{tabs.split()[2]} {tabs.split()[3]}</a></li></ul>"
            f"{table_html('Nov', nov, merged, wrap)}{table_html('Dec', dec, merged, wrap)}"
            "<p>(i) The tidal information is obtained from the Maritime and Port Authority (MPA) of Singapore.</p>"
            "</body></html>")


def at(m, d, hh, mm):
    return datetime(2026, m, d, hh, mm, tzinfo=SGT)


class ParseThePage(unittest.TestCase):
    def test_merged_day_cells_and_flat_rows_give_the_same_result(self):
        a = parse_tide_page(page(merged=True))
        b = parse_tide_page(page(merged=False))
        self.assertEqual(a, b)
        self.assertEqual(len(a), 236)   # Nov 116 + Dec 120

    def test_nested_tags_inside_cells_are_fine(self):
        self.assertEqual(parse_tide_page(page(wrap=True)), parse_tide_page(page()))

    def test_known_values_from_the_real_page(self):
        ex = {e.at: e for e in parse_tide_page(page())}
        self.assertEqual((ex[at(11, 16, 3, 58)].kind, ex[at(11, 16, 3, 58)].height_m), ("high", 2.4))
        self.assertEqual((ex[at(11, 16, 8, 50)].kind, ex[at(11, 16, 8, 50)].height_m), ("low", 1.7))
        self.assertEqual((ex[at(11, 16, 14, 20)].kind, ex[at(11, 16, 14, 20)].height_m), ("high", 2.7))
        self.assertEqual((ex[at(11, 16, 21, 37)].kind, ex[at(11, 16, 21, 37)].height_m), ("low", 0.9))
        self.assertEqual(ex[at(12, 26, 12, 1)].height_m, 3.4)
        self.assertEqual(ex[at(11, 10, 0, 0)].kind, "high")           # midnight

    def test_a_day_with_three_tides_is_kept_as_three(self):
        day = [e for e in parse_tide_page(page()) if e.at.date() == at(11, 3, 0, 0).date()]
        self.assertEqual(len(day), 3)

    def test_times_are_singapore_time(self):
        for e in parse_tide_page(page())[:5]:
            self.assertEqual(e.at.utcoffset(), timedelta(hours=8))

    def test_results_are_in_time_order_across_the_month_boundary(self):
        ex = parse_tide_page(page())
        self.assertEqual(ex, sorted(ex, key=lambda e: e.at))
        self.assertEqual([e.kind for e in ex[:2]], ["high", "low"])
        nov30 = [e for e in ex if e.at.date() == at(11, 30, 0, 0).date()][-1]
        dec1 = [e for e in ex if e.at.date() == at(12, 1, 0, 0).date()][0]
        self.assertEqual((nov30.kind, dec1.kind), ("low", "high"))

    def test_year_comes_from_the_page_labels(self):
        dec_jan = page(tabs="Dec 2026 Jan 2027")
        ex = parse_tide_page(dec_jan.replace(">Nov<", ">Dec<").replace(">Dec<", ">Dec<", 1))
        self.assertTrue(all(e.at.year == 2026 for e in ex))

    def test_year_falls_back_to_today_when_labels_are_missing(self):
        html = page().replace("Nov 2026", "").replace("Dec 2026", "")
        ex = parse_tide_page(html, today=datetime(2026, 11, 16, tzinfo=SGT))
        self.assertEqual(ex[0].at.year, 2026)
        ex = parse_tide_page(html, today=datetime(2026, 12, 20, tzinfo=SGT))
        self.assertEqual(ex[-1].at.year, 2026)

    def test_a_page_with_no_usable_tables_raises(self):
        for bad in ("", "   ", "<html></html>", "<table><tr><td>hello</td></tr></table>", None, 5):
            with self.assertRaises(TideTableError):
                parse_tide_page(bad)

    def test_a_table_with_no_tide_rows_raises(self):
        with self.assertRaises(TideTableError):
            parse_tide_page("<table><tr><th>Nov</th></tr><tr><td>no data today</td></tr></table>")

    def test_an_impossible_date_raises(self):
        with self.assertRaises(TideTableError):
            parse_tide_page(page(nov="31: 0418 2.6 H, 0905 1.8 L"))

    def test_other_tables_on_the_page_are_ignored(self):
        html = "<table><tr><td>Menu</td><td>Home</td></tr></table>" + page()
        self.assertEqual(len(parse_tide_page(html)), 236)

    def test_a_row_before_any_day_number_raises(self):
        html = "<table><tr><th>Nov</th></tr><tr><td>0418</td><td>2.6</td><td>H</td></tr></table>"
        with self.assertRaises(TideTableError):
            parse_tide_page(html)


class ValidateTheTable(unittest.TestCase):
    def setUp(self):
        self.ex = parse_tide_page(page())

    def test_the_real_table_passes(self):
        self.assertEqual(validate_extremes(self.ex), [])

    def test_empty_fails(self):
        self.assertTrue(validate_extremes([]))
        self.assertTrue(validate_extremes(None))

    def test_too_few_days_fails(self):
        self.assertTrue(any("days covered" in p for p in validate_extremes(self.ex[:40])))

    def test_two_highs_in_a_row_fails(self):
        bad = list(self.ex)
        bad[5] = Extreme(bad[5].at, bad[5].height_m, "high" if bad[5].kind == "low" else "low")
        self.assertTrue(validate_extremes(bad))

    def test_an_implausible_height_fails(self):
        bad = list(self.ex)
        bad[10] = Extreme(bad[10].at, 25.0, bad[10].kind)
        self.assertTrue(any("implausible" in p for p in validate_extremes(bad)))

    def test_a_missing_tide_leaves_a_gap_that_fails(self):
        bad = self.ex[:20] + self.ex[22:]
        self.assertTrue(validate_extremes(bad))

    def test_a_high_below_its_low_fails(self):
        bad = list(self.ex)
        e = bad[8] if bad[8].kind == "high" else bad[9]
        i = bad.index(e)
        bad[i] = Extreme(e.at, 0.0, "high")
        self.assertTrue(any("neighbouring low" in p for p in validate_extremes(bad)))

    def test_nan_height_fails(self):
        bad = list(self.ex)
        bad[3] = Extreme(bad[3].at, float("nan"), bad[3].kind)
        self.assertTrue(validate_extremes(bad))


class TideNow(unittest.TestCase):
    def setUp(self):
        self.ex = parse_tide_page(page())

    def test_rising_between_the_low_and_the_high(self):
        n = tide_now(self.ex, at(11, 16, 12, 30))
        self.assertEqual(n["state"], "rising")
        self.assertEqual((n["previous"].at, n["next"].at), (at(11, 16, 8, 50), at(11, 16, 14, 20)))
        self.assertEqual(n["leg_height_m"], 1.0)
        self.assertEqual(n["leg_midpoint"], at(11, 16, 11, 35))
        self.assertEqual(n["minutes_to_next"], 110)
        self.assertGreaterEqual(n["height_estimate_m"], 2.4)
        self.assertLessEqual(n["height_estimate_m"], 2.5)

    def test_falling_between_the_high_and_the_low(self):
        n = tide_now(self.ex, at(11, 16, 18, 0))
        self.assertEqual(n["state"], "falling")
        self.assertEqual(n["leg_height_m"], 1.8)
        self.assertLess(n["height_estimate_m"], 2.7)
        self.assertGreater(n["height_estimate_m"], 0.9)

    def test_estimate_is_the_extreme_itself_at_an_extreme(self):
        n = tide_now(self.ex, at(11, 16, 14, 20))
        self.assertEqual(n["previous"].height_m, 2.7)
        self.assertEqual(n["height_estimate_m"], 2.7)
        self.assertEqual(n["state"], "falling")

    def test_estimate_always_stays_between_the_two_extremes(self):
        t = at(11, 16, 8, 50)
        while t < at(11, 16, 14, 20):
            n = tide_now(self.ex, t)
            self.assertTrue(1.7 <= n["height_estimate_m"] <= 2.7, t)
            t += timedelta(minutes=7)

    def test_it_works_across_midnight_and_the_month_boundary(self):
        n = tide_now(self.ex, at(11, 30, 23, 30))
        self.assertEqual(n["state"], "rising")
        self.assertEqual(n["next"].at, at(12, 1, 5, 0))

    def test_not_covered_means_none(self):
        self.assertIsNone(tide_now(self.ex, at(10, 31, 12, 0)))
        self.assertIsNone(tide_now(self.ex, at(1, 1, 12, 0).replace(year=2027)))
        self.assertIsNone(tide_now([], at(11, 16, 12, 0)))
        self.assertIsNone(tide_now(None, at(11, 16, 12, 0)))

    def test_a_gap_that_is_too_long_means_none(self):
        sparse = [self.ex[0], self.ex[10]]
        self.assertIsNone(tide_now(sparse, sparse[0].at + timedelta(hours=1)))

    def test_two_of_the_same_kind_means_none(self):
        a, b = self.ex[0], self.ex[2]
        self.assertIsNone(tide_now([a, b], a.at + timedelta(hours=2)))

    def test_coverage_end(self):
        self.assertEqual(coverage_end(self.ex), at(12, 31, 23, 1))
        self.assertIsNone(coverage_end([]))


if __name__ == "__main__":
    unittest.main()
