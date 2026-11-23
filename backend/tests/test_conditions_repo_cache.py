"""
The short cache around the spot and catalog lookups in services/conditions_repo.py.
The real module needs SQLAlchemy and a database, so it is loaded here with those parts replaced by stand-ins.
Nothing here touches a database.
"""
import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

REPO_FILE = Path(__file__).resolve().parents[1] / "services" / "conditions_repo.py"


def stub_module(name, **attrs):
    m = types.ModuleType(name)
    m.__dict__.update(attrs)
    return m


def load_repo(env=None):
    """Load conditions_repo.py fresh, with its database imports replaced. Returns the module."""
    stubs = {
        "sqlalchemy": stub_module("sqlalchemy", select=lambda *a, **k: None),
        "sqlalchemy.orm": stub_module("sqlalchemy.orm", selectinload=lambda *a, **k: None),
        "core.db": stub_module("core.db", get_session=lambda: (_ for _ in ()).throw(AssertionError("the database must not be touched"))),
        "models": stub_module("models", Spot=object, Activity=object, ActivityConditionRule=object, FeedFetchLog=object),
        "services.conditions_rules": stub_module("services.conditions_rules", Rule=object, WindSector=object),
        "services.launch_points": stub_module("services.launch_points", select_launch_point=lambda *a, **k: None),
        "services.guidance_policy": stub_module("services.guidance_policy", preview_mode=lambda: False,
                                                provisional_guidance=lambda: False, select_sectors=lambda *a, **k: []),
    }
    if "core" not in sys.modules:
        stubs["core"] = stub_module("core")
    with mock.patch.dict(sys.modules, stubs), mock.patch.dict(os.environ, env or {}, clear=False):
        spec = importlib.util.spec_from_file_location("conditions_repo_under_test", REPO_FILE)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = mod                  # a dataclass looks its own module up by name while it is being made
        spec.loader.exec_module(mod)
    return mod


class Clock:
    def __init__(self): self.t = 500.0
    def __call__(self): return self.t


def context(repo, name="East Coast"):
    return repo.SpotContext(slug="s", name=name, lat=1.0, lng=2.0, activity_slug="windsurf", wind_dependent=True,
                            rules=[{"min": 8}], sectors=[{"a": 1}], launch_point={"lat": 1.3})


class Context(unittest.TestCase):
    def setUp(self):
        self.repo = load_repo()
        self.calls = []

        def fake(slug, activity, level, include_private=False, include_unreviewed=False):
            self.calls.append((slug, activity, level, include_private, include_unreviewed))
            return context(self.repo)
        self.repo._load_context_uncached = fake

    def test_the_second_lookup_does_not_touch_the_database(self):
        a = self.repo.load_context("s", "windsurf", "beginner", False, True)
        b = self.repo.load_context("s", "windsurf", "beginner", False, True)
        self.assertEqual(a, b)
        self.assertEqual(len(self.calls), 1)

    def test_a_different_level_spot_activity_or_flag_is_looked_up_separately(self):
        self.repo.load_context("s", "windsurf", "beginner", False, True)
        self.repo.load_context("s", "windsurf", "advanced", False, True)
        self.repo.load_context("t", "windsurf", "beginner", False, True)
        self.repo.load_context("s", "sup", "beginner", False, True)
        self.repo.load_context("s", "windsurf", "beginner", True, True)       # preview mode
        self.repo.load_context("s", "windsurf", "beginner", False, False)     # provisional guidance off
        self.assertEqual(len(self.calls), 6)

    def test_preview_and_provisional_never_share_an_answer(self):
        self.repo.load_context("s", "windsurf", "beginner", False, False)
        self.repo.load_context("s", "windsurf", "beginner", False, True)
        self.assertEqual({(c[3], c[4]) for c in self.calls}, {(False, False), (False, True)})

    def test_the_arguments_are_passed_through_unchanged(self):
        self.repo.load_context("east-coast", "windsurf", "beginner", True, False)
        self.assertEqual(self.calls, [("east-coast", "windsurf", "beginner", True, False)])

    def test_a_missing_spot_or_unsupported_activity_is_checked_again_each_time(self):
        def boom(*a, **k):
            self.calls.append(a)
            raise self.repo.NotFound("Spot not found")
        self.repo._load_context_uncached = boom
        for _ in range(2):
            with self.assertRaises(self.repo.NotFound):
                self.repo.load_context("nope", "windsurf", "beginner")
        self.assertEqual(len(self.calls), 2)
        boom2 = mock.Mock(side_effect=self.repo.NotSupported("no"))
        self.repo._load_context_uncached = boom2
        for _ in range(2):
            with self.assertRaises(self.repo.NotSupported):
                self.repo.load_context("s", "kayak", "beginner")
        self.assertEqual(boom2.call_count, 2)

    def test_it_looks_again_after_the_time_is_up(self):
        clock = Clock()
        self.repo._context_cache.clock = clock
        self.repo.load_context("s", "windsurf", "beginner")
        clock.t += 119
        self.repo.load_context("s", "windsurf", "beginner")
        self.assertEqual(len(self.calls), 1)
        clock.t += 2
        self.repo.load_context("s", "windsurf", "beginner")
        self.assertEqual(len(self.calls), 2)

    def test_what_one_request_does_to_its_copy_never_reaches_another_request(self):
        first = self.repo.load_context("s", "windsurf", "beginner")
        first.rules.append({"min": 999})
        first.sectors.clear()
        first.launch_point["lat"] = 0
        second = self.repo.load_context("s", "windsurf", "beginner")
        self.assertEqual(second.rules, [{"min": 8}])
        self.assertEqual(second.sectors, [{"a": 1}])
        self.assertEqual(second.launch_point, {"lat": 1.3})


class Catalog(unittest.TestCase):
    def setUp(self):
        self.repo = load_repo()
        self.acts, self.spots = [], []
        self.repo._list_conditions_activities_uncached = lambda: (self.acts.append(1), [{"slug": "windsurf", "name": "Windsurfing"}])[1]

        def spots(activity, include_private=False):
            self.spots.append((activity, include_private))
            if activity == "nope":
                raise self.repo.NotFound("Activity not found")
            return [{"slug": "east-coast", "name": "East Coast"}]
        self.repo._list_spots_for_activity_uncached = spots

    def test_the_activity_list_is_remembered(self):
        for _ in range(3):
            self.assertEqual(self.repo.list_conditions_activities(), [{"slug": "windsurf", "name": "Windsurfing"}])
        self.assertEqual(len(self.acts), 1)

    def test_the_spot_list_is_remembered_per_activity_and_preview_flag(self):
        for _ in range(3):
            self.repo.list_spots_for_activity("windsurf")
        self.repo.list_spots_for_activity("windsurf", True)
        self.repo.list_spots_for_activity("sup")
        self.assertEqual(self.spots, [("windsurf", False), ("windsurf", True), ("sup", False)])

    def test_an_unknown_activity_is_checked_again_each_time(self):
        for _ in range(2):
            with self.assertRaises(self.repo.NotFound):
                self.repo.list_spots_for_activity("nope")
        self.assertEqual(self.spots.count(("nope", False)), 2)

    def test_the_lists_are_copies(self):
        a = self.repo.list_conditions_activities()
        a.append({"slug": "bogus"})
        self.assertEqual(len(self.repo.list_conditions_activities()), 1)


class Setting(unittest.TestCase):
    def count_calls(self, env):
        repo = load_repo(env)
        calls = []
        repo._load_context_uncached = lambda *a, **k: (calls.append(1), context(repo))[1]
        for _ in range(3):
            repo.load_context("s", "windsurf", "beginner")
        return len(calls)

    def test_the_default_is_on(self):
        with mock.patch.dict(os.environ):
            os.environ.pop("WSK_CONTEXT_CACHE_SECONDS", None)
            self.assertEqual(self.count_calls({}), 1)

    def test_zero_turns_it_off(self):
        self.assertEqual(self.count_calls({"WSK_CONTEXT_CACHE_SECONDS": "0"}), 3)

    def test_a_negative_number_also_means_off(self):
        self.assertEqual(self.count_calls({"WSK_CONTEXT_CACHE_SECONDS": "-5"}), 3)

    def test_a_number_that_is_not_a_number_falls_back_to_the_default(self):
        self.assertEqual(self.count_calls({"WSK_CONTEXT_CACHE_SECONDS": "soon"}), 1)

    def test_the_time_comes_from_the_setting(self):
        repo = load_repo({"WSK_CONTEXT_CACHE_SECONDS": "30"})
        self.assertEqual(repo._context_cache.ttl, 30.0)
        self.assertEqual(repo._catalog_cache.ttl, 30.0)


class Isolation(unittest.TestCase):
    def test_loading_it_for_the_test_leaves_the_real_modules_alone(self):
        before = {k: sys.modules.get(k) for k in ("sqlalchemy", "models", "core.db", "services.conditions_rules")}
        load_repo()
        after = {k: sys.modules.get(k) for k in before}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
