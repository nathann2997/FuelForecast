"""Tests for the data health check (health.py) and the auto-fix decisions (remediate.plan). Standard library only:
    python -m unittest sydney/pipeline/test_health.py     (from the repo root; the data-health workflow runs it too)
"""
import datetime as dt, json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import health, remediate  # noqa: E402

UTC = dt.timezone.utc
# 2026-10-22 13:00 Sydney (AEDT, UTC+11)
NOON = dt.datetime(2026, 10, 22, 2, 0, tzinfo=UTC)


def live_row(fuel, now):
    r = {"fuel": fuel, "now": now, "p_jump7": 0.1, "verdict": {"cls": "flat", "head": "No rush either way"}}
    for h in (1, 3, 7, 14): r.update({f"d{h}": 0.5, f"lo{h}": -3.0, f"hi{h}": 3.0})
    return r


def site(tmp, *, asof="2026-10-22", gen="2026-10-22T01:30:00+00:00", n=866, warnings=(), prices=None, ages=1,
         track=True, share=True, med_hist=(236.0, 237.0)):
    """A minimal published site in tmp (what export_api.py writes)"""
    api = os.path.join(tmp, "api", "v1"); os.makedirs(os.path.join(api, "station"), exist_ok=True)
    files = {"forecast.json": 1, "stations.json": 1, "history.json": 1, **({"track.json": 1} if track else {})}
    def w(name, obj):
        with open(os.path.join(api, name), "w") as fh: json.dump(obj, fh)
    w("meta.json", {"schema": 1, "asof": asof, "generated_at": gen, "warnings": list(warnings), "files": files, "history_last": "2026-09-30"})
    w("forecast.json", {"schema": 1, "live": [live_row(f, m) for f, m in [("U91", 237.0), ("E10", 235.0), ("P98", 263.0), ("DL", 278.0)]]})
    prices = prices or [237.0 + (i % 20) - 10 for i in range(n)]
    sts = [{"id": str(i + 1), "n": f"S{i}", "p": {"U91": [p, ages, "ok", "No rush", ""]}} for i, p in enumerate(prices)]
    w("stations.json", {"schema": 1, "stations": sts})
    for s in sts: w(f"station/{s['id']}.json", {"schema": 1})
    w("history.json", {"schema": 1, "hist": {f: {"med": list(med_hist)} for f in health.FUELS}})
    if track: w("track.json", {"schema": 1})
    if share:
        os.makedirs(os.path.join(tmp, "s"), exist_ok=True)
        with open(os.path.join(tmp, "s", "index.html"), "w") as fh: fh.write("<!doctype html>")
    return tmp


def codes(rep): return sorted(i["code"] for i in rep["issues"])


class HealthChecks(unittest.TestCase):
    def run_on(self, now=NOON, **kw):
        with tempfile.TemporaryDirectory() as t:
            return health.report(site(t, **kw), now)

    def test_healthy(self):
        rep = self.run_on()
        self.assertTrue(rep["ok"], rep["issues"])
        self.assertEqual(rep["facts"]["stations"], 866)

    def test_yesterdays_data_is_critical_after_0730(self):
        rep = self.run_on(asof="2026-10-21", gen="2026-10-21T10:20:00+00:00")
        self.assertIn("API_STALE", codes(rep))
        self.assertFalse(rep["ok"])
        # before 07:30 Sydney the first run may still be on its way
        early = dt.datetime(2026, 10, 21, 19, 0, tzinfo=UTC)   # 06:00 on the 22nd
        self.assertNotIn("API_STALE", codes(self.run_on(now=early, asof="2026-10-21", gen="2026-10-21T10:20:00+00:00")))

    def test_skipped_slot_is_overdue_by_day_not_by_night(self):
        self.assertIn("RUN_OVERDUE", codes(self.run_on(gen="2026-10-21T19:00:00+00:00")))   # 7 h old at 13:00
        night = dt.datetime(2026, 10, 22, 16, 0, tzinfo=UTC)   # 03:00 on the 23rd... asof is then yesterday, but before 07:30
        self.assertNotIn("RUN_OVERDUE", codes(self.run_on(now=night, gen="2026-10-22T10:20:00+00:00")))

    def test_outliers_and_station_count(self):
        rep = self.run_on(prices=[237.0] * 800 + [23.9, 2399.0])
        self.assertIn("PRICE_OUTLIER", codes(rep))
        self.assertIn("23.9", next(i for i in rep["issues"] if i["code"] == "PRICE_OUTLIER")["detail"])
        self.assertEqual([i["severity"] for i in self.run_on(n=500)["issues"] if i["code"] == "STATIONS_FEW"], ["critical"])
        self.assertEqual([i["severity"] for i in self.run_on(n=700)["issues"] if i["code"] == "STATIONS_FEW"], ["warning"])

    def test_stale_feed_and_median_jump(self):
        self.assertIn("NSW_STALE", codes(self.run_on(ages=3)))
        self.assertNotIn("MEDIAN_JUMP", codes(self.run_on(med_hist=(236.0, 275.0))))          # a real 39c hike day
        self.assertIn("MEDIAN_JUMP", codes(self.run_on(med_hist=(236.0, 290.0))))             # beyond anything real
        self.assertIn("MEDIAN_JUMP", codes(self.run_on(med_hist=(236.0, 260.0, 237.0))))      # spike and back: a bad day

    def test_pipeline_warnings_are_mapped(self):
        rep = self.run_on(warnings=["tgp_last is 14 days old", "station files unavailable: X", "implausible prices hidden: A U91 23.9"])
        by = {i["code"]: i for i in rep["issues"]}
        self.assertIsNone(by["INPUT_TGP"]["fix"])
        self.assertEqual(by["STATION_FILES"]["fix"], "rerun")
        self.assertEqual(by["QUARANTINED"]["severity"], "info")

    def test_missing_track_and_share_page(self):
        self.assertIn("TRACK", codes(self.run_on(track=False)))
        self.assertIn("SHARE_PAGE", codes(self.run_on(share=False)))

    def test_unreachable(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(codes(health.report(t, NOON)), ["API_UNREACHABLE"])

    def test_quarantine_info_alone_is_ok(self):
        self.assertTrue(self.run_on(warnings=["implausible prices hidden: A U91 23.9"])["ok"])


def run(id, status="completed", conclusion="success", event="schedule", created="2026-10-22T00:00:00Z", updated=None,
        actor="nathann2997", actor_type="User"):
    return {"id": id, "status": status, "conclusion": conclusion, "event": event, "created_at": created,
            "updated_at": updated or created, "actor": actor, "actor_type": actor_type}


BOT = remediate.BOT
STALE = {"issues": [{"code": "API_STALE", "severity": "critical", "title": "stale", "fix": "rerun"}], "facts": {}}
TGP = {"issues": [{"code": "INPUT_TGP", "severity": "warning", "title": "tgp", "fix": None}], "facts": {}}
OK = {"issues": [], "facts": {}}


class Plan(unittest.TestCase):
    def test_fixable_problem_is_fixed_quietly_first(self):
        a = remediate.plan(STALE, [run(1, created="2026-10-21T23:00:00Z")], "active", None, NOON)
        self.assertTrue(a["dispatch"])
        self.assertEqual(a["issue"], None)   # no alert yet

    def test_alert_when_an_auto_run_did_not_fix_it(self):
        runs = [run(2, event="workflow_dispatch", actor=BOT, actor_type="Bot", conclusion="failure",
                    created="2026-10-22T01:40:00Z", updated="2026-10-22T01:50:00Z")]
        a = remediate.plan(STALE, runs, "active", None, NOON)
        self.assertFalse(a["dispatch"])        # 20 min since the last auto-run: too soon to try again
        self.assertEqual(a["issue"], "create")
        self.assertEqual(a["codes"], ["API_STALE", "RUN_FAILED"])

    def test_never_while_a_run_is_in_progress(self):
        a = remediate.plan(STALE, [run(3, status="in_progress", conclusion=None)], "active", None, NOON)
        self.assertFalse(a["dispatch"])

    def test_budget_stops_loops_and_escalates(self):
        runs = [run(10 + k, event="workflow_dispatch", actor=BOT, actor_type="Bot", conclusion="failure",
                    created=f"2026-10-22T0{k}:00:00Z", updated=f"2026-10-22T0{k}:10:00Z") for k in range(remediate.MAX_AUTO_RUNS)][::-1]
        a = remediate.plan(STALE, runs, "active", None, dt.datetime(2026, 10, 22, 5, 0, tzinfo=UTC))
        self.assertFalse(a["dispatch"])
        self.assertTrue(a["escalate"])
        self.assertEqual(a["issue"], "create")
        self.assertIn("RUN_FAILED", a["codes"])

    def test_failed_run_is_retried(self):
        a = remediate.plan(OK, [run(4, conclusion="failure", created="2026-10-22T01:00:00Z")], "active", None, NOON)
        self.assertTrue(a["dispatch"])
        self.assertEqual(a["why"], ["RUN_FAILED"])

    def test_settling_after_a_successful_run(self):
        just = run(5, created="2026-10-22T01:50:00Z", updated="2026-10-22T01:55:00Z")
        self.assertFalse(remediate.plan(STALE, [just], "active", None, NOON)["dispatch"])

    def test_unfixable_problem_alerts_at_once_and_only_once(self):
        a = remediate.plan(TGP, [], "active", None, NOON)
        self.assertEqual((a["dispatch"], a["issue"]), (False, "create"))
        same = remediate.plan(TGP, [], "active", {"number": 1, "codes": ["INPUT_TGP"], "escalated": False}, NOON)
        self.assertIsNone(same["issue"])
        more = remediate.plan({"issues": TGP["issues"] + [{"code": "PRICE_OUTLIER", "severity": "warning", "title": "x", "fix": None}]},
                              [], "active", {"number": 1, "codes": ["INPUT_TGP"], "escalated": False}, NOON)
        self.assertEqual(more["issue"], "comment")

    def test_recovery_closes_the_issue(self):
        a = remediate.plan(OK, [run(6)], "active", {"number": 1, "codes": ["API_STALE"], "escalated": False}, NOON)
        self.assertEqual(a["issue"], "close")
        # but not while a quiet auto-fix is still under way
        b = remediate.plan(STALE, [run(6, created="2026-10-21T20:00:00Z")], "active", {"number": 1, "codes": ["INPUT_TGP"], "escalated": False}, NOON)
        self.assertIsNone(b["issue"])

    def test_paused_schedule_is_reenabled_and_alerted(self):
        a = remediate.plan(OK, [], "disabled_inactivity", None, NOON)
        self.assertTrue(a["enable"])
        self.assertEqual(a["issue"], "create")
        manual = remediate.plan(OK, [], "disabled_manually", None, NOON)
        self.assertFalse(manual["enable"])

    def test_bot_runs_are_known_by_type_and_a_hard_stop_ends_any_loop(self):
        bot = [run(20 + k, event="workflow_dispatch", actor="some-bot-name", actor_type="Bot", conclusion="failure",
                   created=f"2026-10-22T0{k}:00:00Z", updated=f"2026-10-22T0{k}:10:00Z") for k in range(remediate.MAX_AUTO_RUNS)][::-1]
        self.assertFalse(remediate.plan(STALE, bot, "active", None, dt.datetime(2026, 10, 22, 5, 0, tzinfo=UTC))["dispatch"])
        # an actor that isn't recognised as a bot at all: the cap on all runs of the day still stops it
        many = [run(40 + k, event="workflow_dispatch", actor="?", actor_type=None, conclusion="failure",
                    created=f"2026-10-21T{13 + k // 2:02d}:{30 * (k % 2):02d}:00Z") for k in range(remediate.MAX_RUNS_DAY)][::-1]
        a = remediate.plan(STALE, many, "active", None, dt.datetime(2026, 10, 22, 2, 0, tzinfo=UTC))
        self.assertFalse(a["dispatch"])
        self.assertTrue(a["escalate"])

    def test_budget_is_counted_by_sydney_day(self):
        # 4 auto-runs on the 21st in UTC terms but the 22nd in Sydney (after 13:00 UTC): today's budget is spent
        runs = [run(60 + k, event="workflow_dispatch", actor=BOT, actor_type="Bot", conclusion="failure",
                    created=f"2026-10-21T{14 + k}:00:00Z", updated=f"2026-10-21T{14 + k}:10:00Z") for k in range(4)][::-1]
        self.assertFalse(remediate.plan(STALE, runs, "active", None, dt.datetime(2026, 10, 21, 22, 0, tzinfo=UTC))["dispatch"])
        # and the next Sydney day starts fresh
        self.assertTrue(remediate.plan(STALE, runs, "active", None, dt.datetime(2026, 10, 22, 14, 0, tzinfo=UTC))["dispatch"])

    def test_no_comment_when_a_problem_drops_out_during_a_fix(self):
        both = {"issues": TGP["issues"] + STALE["issues"], "facts": {}}
        open_ = {"number": 1, "codes": ["API_STALE", "INPUT_TGP"], "escalated": False}
        a = remediate.plan(both, [run(7, created="2026-10-21T20:00:00Z")], "active", open_, NOON)
        self.assertTrue(a["dispatch"])
        self.assertIsNone(a["issue"])

    def test_no_alert_while_a_successful_run_settles(self):
        tried = run(8, event="workflow_dispatch", actor=BOT, actor_type="Bot", created="2026-10-22T01:45:00Z", updated="2026-10-22T01:55:00Z")
        a = remediate.plan(STALE, [tried], "active", None, NOON)
        self.assertEqual((a["dispatch"], a["issue"]), (False, None))

    def test_names_from_the_feed_cant_mention_or_inject(self):
        rep = {"issues": [{"code": "PRICE_OUTLIER", "severity": "warning", "title": "x", "detail": "@someone `code` <b>", "fix": None}]}
        b = remediate.body(remediate.plan(rep, [], "active", None, NOON), {"facts": {}}, "nathann2997", "o/r")
        self.assertNotIn("@someone", b)
        self.assertNotIn("<b>", b)
        self.assertNotIn("`", b)

    def test_issue_body_mentions_the_owner_and_records_codes(self):
        a = remediate.plan(TGP, [], "active", None, NOON)
        b = remediate.body(a, {"facts": {"asof": "2026-10-22"}, "sydney_now": "x"}, "nathann2997", "o/r")
        self.assertIn("@nathann2997", b)
        self.assertIn("<!-- data-health: INPUT_TGP -->", b)


if __name__ == "__main__":
    unittest.main()
