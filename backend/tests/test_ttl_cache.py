import threading
import unittest

from services.ttl_cache import TtlCache


class Clock:
    def __init__(self): self.t = 1000.0
    def __call__(self): return self.t


class Loader:
    def __init__(self, value=None, boom=None):
        self.calls, self.value, self.boom = 0, value, boom
    def __call__(self):
        self.calls += 1
        if self.boom:
            raise self.boom
        return self.value() if callable(self.value) else self.value


class Basics(unittest.TestCase):
    def test_the_second_ask_is_served_without_loading(self):
        c, load = TtlCache(120, Clock()), Loader({"a": 1})
        self.assertEqual(c.get("k", load), {"a": 1})
        self.assertEqual(c.get("k", load), {"a": 1})
        self.assertEqual(load.calls, 1)

    def test_a_different_key_loads_separately(self):
        c, load = TtlCache(120, Clock()), Loader(1)
        c.get(("windsurf", "beginner"), load)
        c.get(("windsurf", "advanced"), load)
        self.assertEqual(load.calls, 2)

    def test_it_loads_again_after_the_time_is_up(self):
        clock = Clock()
        c, load = TtlCache(120, clock), Loader(1)
        c.get("k", load)
        clock.t += 119
        c.get("k", load)
        self.assertEqual(load.calls, 1)
        clock.t += 2
        c.get("k", load)
        self.assertEqual(load.calls, 2)

    def test_a_zero_time_to_live_turns_it_off(self):
        c, load = TtlCache(0, Clock()), Loader(1)
        for _ in range(3):
            c.get("k", load)
        self.assertEqual(load.calls, 3)
        self.assertEqual(len(c), 0)

    def test_an_error_is_passed_on_and_not_stored(self):
        c = TtlCache(120, Clock())
        bad = Loader(boom=KeyError("nope"))
        for _ in range(2):
            with self.assertRaises(KeyError):
                c.get("k", bad)
        self.assertEqual(bad.calls, 2)                       # tried again, not remembered as a failure
        self.assertEqual(len(c), 0)
        good = Loader("fine")
        self.assertEqual(c.get("k", good), "fine")

    def test_clear_forgets_everything(self):
        c, load = TtlCache(120, Clock()), Loader(1)
        c.get("k", load)
        c.clear()
        c.get("k", load)
        self.assertEqual(load.calls, 2)


class Copies(unittest.TestCase):
    def test_changing_what_you_got_never_changes_what_others_get(self):
        c = TtlCache(120, Clock())
        first = c.get("k", Loader({"rules": [1, 2]}))
        first["rules"].append(99)
        second = c.get("k", Loader({"rules": ["not used"]}))
        self.assertEqual(second, {"rules": [1, 2]})
        second["rules"].clear()
        self.assertEqual(c.get("k", Loader(None)), {"rules": [1, 2]})

    def test_the_loaded_value_is_also_kept_apart_from_the_first_caller(self):
        c = TtlCache(120, Clock())
        loaded = {"x": [1]}
        got = c.get("k", Loader(loaded))
        got["x"].append(2)
        self.assertEqual(c.get("k", Loader(None)), {"x": [1]})


class Size(unittest.TestCase):
    def test_the_oldest_entry_goes_when_it_is_full(self):
        clock = Clock()
        c = TtlCache(1000, clock, max_entries=3)
        for k in "abc":
            clock.t += 1
            c.get(k, Loader(k))
        clock.t += 1
        c.get("d", Loader("d"))
        self.assertEqual(len(c), 3)
        load = Loader("a2")
        c.get("a", load)                                     # "a" was the oldest, so it was dropped
        self.assertEqual(load.calls, 1)
        load_c = Loader("c2")
        c.get("c", load_c)
        self.assertEqual(load_c.calls, 0)                    # "c" is still remembered

    def test_refreshing_a_key_does_not_evict_another(self):
        clock = Clock()
        c = TtlCache(10, clock, max_entries=2)
        c.get("a", Loader(1)); clock.t += 1
        c.get("b", Loader(2)); clock.t += 20                # both expired
        c.get("a", Loader(3))                               # reloads a in its own slot
        self.assertEqual(len(c), 2)


class Threads(unittest.TestCase):
    def test_many_threads_asking_at_once_all_get_a_whole_answer(self):
        c = TtlCache(120)
        results, errors = [], []

        def work():
            try:
                results.append(c.get("k", lambda: {"rules": list(range(50))}))
            except Exception as e:                           # pragma: no cover
                errors.append(e)
        threads = [threading.Thread(target=work) for _ in range(40)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(errors, [])
        self.assertTrue(all(r == {"rules": list(range(50))} for r in results))
        self.assertEqual(len(results), 40)


if __name__ == "__main__":
    unittest.main()
