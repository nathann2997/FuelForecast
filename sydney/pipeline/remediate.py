"""Acts on a health report (health.py): fixes what another pipeline run can fix, and alerts the owner about the rest.

usage: python remediate.py report.json [--dry-run]     (in the data-health workflow; needs GH_TOKEN and GITHUB_REPOSITORY)

Fixes, within a budget so a broken pipeline can't loop:
  rerun   dispatch daily.yml when an issue has fix="rerun", the latest run failed, or data is stale/overdue.
          Never while a run is queued or running, at most MAX_AUTO_RUNS a Sydney day, MIN_GAP_MIN apart, and not within
          SETTLE_MIN of a successful run (Pages may still be publishing it).
  enable  re-enable daily.yml if GitHub paused it for inactivity (not if someone disabled it by hand).
Alerts: one open GitHub issue labelled `data-health`, @mentioning the owner (GitHub notifies by email and the mobile
app). A fixable problem is fixed quietly first; it's alerted only once a completed auto-run hasn't cleared it and no new
attempt is due yet, or the budget has run out. Problems no rerun can fix (a source that stopped updating, implausible prices, a schema change) are
alerted at once. The issue gets a comment only when the set of problems changes, and is closed when all is well.
plan() makes every decision from plain data, so it's unit-tested (test_health.py); main() only gathers and acts.
"""
import datetime as dt, json, os, subprocess, sys
from zoneinfo import ZoneInfo

SYD = ZoneInfo("Australia/Sydney")
WORKFLOW = "daily.yml"
LABEL, ESCALATED = "data-health", "needs-human"
BOT = "github-actions[bot]"
MAX_AUTO_RUNS = 4          # per Sydney day
MAX_RUNS_DAY = 12          # hard stop: no auto-run once this many pipeline runs of any kind started today (5 are scheduled)
MIN_GAP_MIN = 40           # between auto-runs
SETTLE_MIN = 12            # after a successful run, give Pages time before calling the data stale
TRIED_WINDOW_H = 2         # an auto-run completed this recently "tried" the fix
ACTIVE = {"queued", "in_progress", "waiting", "pending", "requested"}
MARK = "<!-- data-health:"


def ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def run_issues(runs, wf_state):
    """Problems seen in the workflow itself: a failed latest run, or a paused schedule"""
    out = []
    done = [r for r in runs if r.get("status") == "completed" and r.get("conclusion") not in ("cancelled", "skipped")]
    if done and done[0].get("conclusion") in ("failure", "timed_out", "startup_failure"):
        r = done[0]
        out.append({"code": "RUN_FAILED", "severity": "critical", "title": "The last pipeline run failed",
                    "detail": f"run {r.get('id')} ({r.get('event')}) {r.get('conclusion')} at {r.get('updated_at')}", "fix": "rerun",
                    "hint": f"Log: {r.get('html_url', '')}"})
    if wf_state and wf_state != "active":
        manual = wf_state == "disabled_manually"
        out.append({"code": "WORKFLOW_DISABLED", "severity": "critical", "title": "The price pipeline is switched off",
                    "detail": f"daily.yml is {wf_state}", "fix": None if manual else "enable",
                    "hint": "Someone disabled it by hand: re-enable it in Actions if that wasn't meant." if manual else ""})
    return out


def plan(report, runs, wf_state, issue_state, now):
    """What to do. runs: daily.yml runs, newest first ({id, status, conclusion, event, created_at, updated_at, actor});
    issue_state: None, or {number, codes (last reported), escalated}. Returns {"dispatch", "enable", "why", "alert",
    "issue": None | "create" | "comment" | "close", "escalate", "issues"}."""
    issues = [i for i in report.get("issues", [])] + run_issues(runs, wf_state)
    local = now.astimezone(SYD)
    busy = any(r.get("status") in ACTIVE for r in runs)
    # Runs this monitor started: dispatched by a bot (GITHUB_TOKEN). Matched on the actor's type, and the login as a fallback
    auto = [r for r in runs if r.get("event") == "workflow_dispatch" and (r.get("actor_type") == "Bot" or str(r.get("actor", "")).endswith("[bot]"))]
    runs_today = [r for r in runs if ts(r["created_at"]).astimezone(SYD).date() == local.date()]
    auto_today = [r for r in auto if ts(r["created_at"]).astimezone(SYD).date() == local.date()]
    last_auto = max((ts(r["created_at"]) for r in auto), default=None)
    tried = any(r.get("status") == "completed" and now - ts(r["updated_at"]) <= dt.timedelta(hours=TRIED_WINDOW_H) for r in auto)
    ok_runs = [r for r in runs if r.get("status") == "completed" and r.get("conclusion") == "success"]
    settling = bool(ok_runs) and now - ts(ok_runs[0]["updated_at"]) < dt.timedelta(minutes=SETTLE_MIN)

    act = {"dispatch": False, "enable": False, "why": [], "escalate": False, "issues": issues}
    fixable = [i for i in issues if i.get("fix") == "rerun" and i["severity"] != "info"]
    # a run that just succeeded makes freshness problems moot until Pages has published it
    if settling: fixable = [i for i in fixable if i["code"] not in ("API_STALE", "RUN_OVERDUE", "RUN_FAILED")]
    if any(i.get("fix") == "enable" for i in issues):
        act["enable"] = True
    # The day's budget, plus a hard stop on all runs: if the bot isn't recognised, this still ends any loop
    budget_left = len(auto_today) < MAX_AUTO_RUNS and len(runs_today) < MAX_RUNS_DAY
    gap_ok = last_auto is None or now - last_auto >= dt.timedelta(minutes=MIN_GAP_MIN)
    if fixable and not busy:
        if budget_left and gap_ok:
            act["dispatch"] = True
            act["why"] = [i["code"] for i in fixable]
        elif not budget_left:
            act["escalate"] = True
    # Alert: anything no rerun can fix (and a paused schedule, which is rare) at once; a fixable one only when a completed
    # auto-run has tried and it's still there and no fresh attempt is starting now, or the day's budget is spent
    alerting = [i for i in issues if i["severity"] != "info" and (
        i.get("fix") != "rerun" or (tried and not act["dispatch"]) or act["escalate"])
        and not (settling and i["code"] in ("API_STALE", "RUN_OVERDUE", "RUN_FAILED"))]
    act["alert"] = alerting
    codes = sorted({i["code"] for i in alerting})
    problems = [i for i in issues if i["severity"] != "info"]
    if alerting:
        if not issue_state: act["issue"] = "create"
        # Comment only when something new appears (a problem dropping out while a fix runs isn't news)
        elif set(codes) - set(issue_state.get("codes", [])) or (act["escalate"] and not issue_state.get("escalated")): act["issue"] = "comment"
        else: act["issue"] = None
    elif issue_state and not problems:
        act["issue"] = "close"
    else:
        act["issue"] = None   # healthy with no issue open, or a quiet auto-fix in progress
    act["codes"] = codes
    return act


def body(act, report, owner, repo):
    lines = []
    if act.get("escalate"):
        lines.append(f"**Automatic fixes have run out for today ({MAX_AUTO_RUNS} pipeline runs).** A person needs to look.\n")
    lines.append("| | Problem | Detail | What to do |\n|---|---|---|---|")
    for i in act["alert"]:
        icon = "🔴" if i["severity"] == "critical" else "🟠"
        fix = "Bowser reruns the pipeline automatically" if i.get("fix") == "rerun" else ("Re-enabled automatically" if i.get("fix") == "enable" else "Needs a person")
        hint = f"{fix}. {i.get('hint', '')}".strip()
        # Station names come from the NSW feed: no @mentions, code or HTML from them in the issue
        cell = lambda s: (str(s).replace("|", "\\|").replace("\n", " ").replace("@", "@\u200b").replace("`", "'")
                          .replace("<", "&lt;").replace(">", "&gt;"))[:300]
        lines.append(f"| {icon} | {cell(i['title'])} | {cell(i.get('detail', ''))} | {cell(hint)} |")
    did = []
    if act.get("dispatch"): did.append(f"started a pipeline run ({', '.join(act['why'])})")
    if act.get("enable"): did.append("re-enabled the daily schedule" if act.get("enabled", True) else "tried to re-enable the daily schedule, and GitHub refused")
    if did: lines.append(f"\nJust now the monitor {' and '.join(did)}.")
    f = report.get("facts", {})
    lines.append(f"\nAPI data for {f.get('asof', '?')}, published {f.get('age_hours', '?')} h ago · {f.get('stations', '?')} stations · checked {report.get('sydney_now', '')} Sydney time.")
    lines.append(f"Runs: https://github.com/{repo}/actions/workflows/{WORKFLOW} · Health checks: https://github.com/{repo}/actions/workflows/data-health.yml"
                 f" · What each alert means: https://github.com/{repo}/blob/main/docs/DATA_HEALTH.md")
    lines.append(f"\ncc @{owner}\n\n{MARK} {','.join(act['codes'])} -->")
    return "\n".join(lines)


def step_summary(act, report):
    """The run's page in Actions: every check's result and what was done"""
    f = report.get("facts", {})
    out = [f"### Data health: {'✅ all good' if not [i for i in act['issues'] if i['severity'] != 'info'] else '⚠️ problems'}",
           f"API data for {f.get('asof')}, published {f.get('age_hours')} h ago · {f.get('stations')} stations · "
           f"{f.get('u91_updated_1d')} of U91 prices changed in a day · checked {report.get('sydney_now')} Sydney time", ""]
    if act["issues"]:
        out.append("| Severity | Code | Problem | Detail | Fix |\n|---|---|---|---|---|")
        out += [f"| {i['severity']} | {i['code']} | {i['title']} | {str(i.get('detail', '')).replace('|', '/')[:200]} | {i.get('fix') or '–'} |"
                for i in act["issues"]]
    did = [x for x, on in [(f"started a pipeline run ({', '.join(act['why'])})", act["dispatch"]),
                           ("re-enabled the schedule", act["enable"]), ("escalated", act["escalate"])] if on]
    out.append(f"\nActions: {'; '.join(did) or 'none'} · issue: {act['issue'] or 'no change'}\n")
    return "\n".join(out)


# ---- GitHub side (gh CLI)

def gh(*args, check=True):
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError(f"gh {' '.join(args[:3])}: {r.stderr.strip()[:300]}")
    return r.stdout


def gather(repo):
    raw = json.loads(gh("api", f"repos/{repo}/actions/workflows/{WORKFLOW}/runs?per_page=40"))
    runs = [{"id": r["id"], "status": r["status"], "conclusion": r["conclusion"], "event": r["event"], "created_at": r["created_at"],
             "updated_at": r["updated_at"], "html_url": r["html_url"], "actor": (r.get("triggering_actor") or {}).get("login"),
             "actor_type": (r.get("triggering_actor") or {}).get("type")}
            for r in raw.get("workflow_runs", [])]
    wf_state = json.loads(gh("api", f"repos/{repo}/actions/workflows/{WORKFLOW}")).get("state")
    found = json.loads(gh("issue", "list", "-R", repo, "--label", LABEL, "--state", "open", "--json", "number,author,body,labels,comments", "--limit", "1"))
    issue_state = None
    if found:
        i = found[0]
        # Only the monitor's own words count: anyone can comment on a public repo's issue
        mine = lambda a: str((a or {}).get("login", "")).endswith("[bot]") or (a or {}).get("login") == "github-actions"
        texts = ([i.get("body") or ""] if mine(i.get("author")) else []) + [c.get("body") or "" for c in i.get("comments", []) if mine(c.get("author"))]
        last = next((t for t in reversed(texts) if MARK in t), "")
        codes = last.split(MARK, 1)[1].split("-->", 1)[0].strip() if last else ""
        issue_state = {"number": i["number"], "codes": [c for c in codes.split(",") if c],
                       "escalated": any(l.get("name") == ESCALATED for l in i.get("labels", []))}
    return runs, wf_state, issue_state


def main():
    rep = json.load(open(sys.argv[1]))
    dry = "--dry-run" in sys.argv
    repo = os.environ["GITHUB_REPOSITORY"]
    owner = os.environ.get("ALERT_OWNER") or repo.split("/")[0]
    now = dt.datetime.now(dt.timezone.utc)
    runs, wf_state, issue_state = gather(repo)
    act = plan(rep, runs, wf_state, issue_state, now)
    summary = {k: act[k] for k in ("dispatch", "enable", "why", "escalate", "issue", "codes")}
    print("remediate:", json.dumps(summary))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as fh: fh.write(step_summary(act, rep))
    if dry: return
    if act["enable"]:
        try: gh("api", "-X", "PUT", f"repos/{repo}/actions/workflows/{WORKFLOW}/enable")
        except RuntimeError as e: act["enabled"] = False; print(f"remediate: couldn't re-enable {WORKFLOW}: {e}")
    if act["dispatch"]: gh("workflow", "run", WORKFLOW, "-R", repo, "-f", "backtest=false")
    if act["issue"] in ("create", "comment"):
        for name, color, desc in [(LABEL, "d93f0b", "Automatic data health alerts"), (ESCALATED, "b60205", "Auto-fix gave up")]:
            gh("label", "create", name, "-R", repo, "--color", color, "--description", desc, check=False)
        text = body(act, rep, owner, repo)
        top = act["alert"][0]["title"]
        labels = [LABEL] + ([ESCALATED] if act["escalate"] else [])
        if act["issue"] == "create":
            gh("issue", "create", "-R", repo, "--title", f"Data health: {top}", "--label", ",".join(labels), "--body", text)
        else:
            n = str(issue_state["number"])
            gh("issue", "comment", n, "-R", repo, "--body", text)
            gh("issue", "edit", n, "-R", repo, "--title", f"Data health: {top}", *(["--add-label", ESCALATED] if act["escalate"] else []), check=False)
    elif act["issue"] == "close":
        f = rep.get("facts", {})
        gh("issue", "close", str(issue_state["number"]), "-R", repo, "--comment",
           f"✅ Recovered: API data for {f.get('asof')}, published {f.get('age_hours')} h ago, all checks pass ({rep.get('sydney_now')} Sydney time).\n\n{MARK} -->")


if __name__ == "__main__":
    main()
