"""Data health check for the published app API: is what users see fresh, complete and plausible?

usage: python health.py [BASE] [--out report.json]
  BASE  the site root (default https://nathann2997.github.io/FuelForecast) or a local export dir (export_api.py's OUT)

Checks the API the way the app sees it (cache-busted, so a CDN copy can't hide a fresh deploy) and writes a report:
  {"checked_at", "sydney_now", "base", "ok", "issues": [{code, severity, title, detail, fix, hint}], "facts": {...}}
severity: critical (users see wrong or old data) / warning (degraded, or a source needs a look) / info (no alert).
fix: "rerun" when another pipeline run usually clears it (remediate.py does that), else null (a person has to look).
Standard library only: the data-health workflow runs it with no pip install. Keep thresholds in step with
export_api.py (the price quarantine) and the cron slots in .github/workflows/daily.yml.
"""
import datetime as dt, json, os, statistics, sys, time, urllib.error, urllib.request
from zoneinfo import ZoneInfo

SYD = ZoneInfo("Australia/Sydney")
from fuels import FUELS
DEFAULT_BASE = "https://nathann2997.github.io/FuelForecast"

# Freshness. The first run (05:13) can start late, so today's data is expected from 07:30. Daytime slots are at most 5 h
# apart (05:13, 10:13, 13:13, 17:13, 21:13), so data older than 5.5 h between 07:30 and 23:30 means a slot was skipped.
TODAY_BY = dt.time(7, 30)
DAY_FROM, DAY_TO = TODAY_BY, dt.time(23, 30)   # from 07:30: before then the overnight gap (21:13 → 05:13, often late) is normal
OVERDUE_H = 5.5
# Stations and prices
STATIONS_WARN, STATIONS_CRIT = 780, 600          # about 866 on a normal day; export_api fails below 500
FRESH_SHARE_MIN = 0.2                            # share of U91 prices updated in the last day (normally 0.4-0.6)
OUT_LO, OUT_HI = -45, 80                         # c/L from the fuel's median: same as export_api's quarantine
ABS_LO, ABS_HI = 80, 600
# One-day median moves. Real hikes reach 39c in a day (E10, 10 Dec 2019; U91 34.6c, 3 Jun 2025), so only a move beyond
# anything seen since 2019, or a 15c+ spike that reverses the next day (never happened for real: a bad snapshot), alerts
MEDIAN_JUMP, SPIKE = 50, 15
HISTORY_LAG_DAYS = 50


def issue(code, severity, title, detail="", fix=None, hint=""):
    return {"code": code, "severity": severity, "title": title, "detail": detail, "fix": fix, "hint": hint}


class Source:
    """Reads BASE/<path> from the web (cache-busted, with retries) or from a local directory"""
    def __init__(self, base):
        self.base, self.web = base.rstrip("/"), base.startswith("http")

    def get(self, path, tries=3):
        """(status, parsed JSON or text or None). status 0 = unreachable."""
        if not self.web:
            p = os.path.join(self.base, path.split("?")[0])
            if os.path.isdir(p): p = os.path.join(p, "index.html")
            if not os.path.exists(p): return 404, None
            with open(p, encoding="utf-8") as fh: txt = fh.read()
            return 200, (json.loads(txt) if p.endswith(".json") else txt)
        sep = "&" if "?" in path else "?"
        url = f"{self.base}/{path}{sep}cb={int(time.time())}"
        for t in range(tries):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "bowser-data-health", "Cache-Control": "no-cache"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    body = r.read(30 * 1024 * 1024).decode("utf-8")
                    return r.status, (json.loads(body) if path.split("?")[0].endswith(".json") else body)
            except urllib.error.HTTPError as e:
                if e.code == 404: return 404, None
                if t == tries - 1: return e.code, None
            except (urllib.error.URLError, TimeoutError, ValueError):
                if t == tries - 1: return 0, None
            time.sleep(3 * (t + 1))
        return 0, None


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")


def check(src, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    local = now.astimezone(SYD)
    today = local.date().isoformat()
    issues, facts = [], {}

    st, meta = src.get("api/v1/meta.json")
    if st != 200 or not isinstance(meta, dict):
        issues.append(issue("API_UNREACHABLE", "critical", "The app API can't be read",
                            f"api/v1/meta.json returned {st or 'no response'}", "rerun",
                            "If a rerun doesn't fix it, check GitHub Pages (Settings → Pages) and the last deploy job."))
        return issues, facts
    if meta.get("schema") != 1:
        issues.append(issue("SCHEMA", "critical", "The API schema changed", f"meta.schema = {meta.get('schema')!r}; the app expects 1",
                            None, "A pipeline change bumped the schema without an app update."))
    asof, gen = meta.get("asof"), meta.get("generated_at")
    facts.update(asof=asof, generated_at=gen, warnings=meta.get("warnings", []), files=meta.get("files", {}))
    try:
        age_h = (now - dt.datetime.fromisoformat(gen)).total_seconds() / 3600
    except (TypeError, ValueError):
        age_h = None
    facts["age_hours"] = None if age_h is None else round(age_h, 2)

    # ---- freshness
    if asof and asof < today and local.time() >= TODAY_BY:
        issues.append(issue("API_STALE", "critical", "The app is showing yesterday's prices",
                            f"API data is for {asof}; it's {local:%H:%M} on {today} in Sydney", "rerun",
                            "Today's first run didn't publish. If reruns keep failing, read the failed run's log."))
    elif age_h is not None and age_h > OVERDUE_H and DAY_FROM <= local.time() <= DAY_TO:
        issues.append(issue("RUN_OVERDUE", "warning", "Prices haven't refreshed on schedule",
                            f"Last published {age_h:.1f} h ago (runs are at most 5 h apart in the day)", "rerun",
                            "GitHub skipped or delayed a scheduled run."))

    # ---- core files
    core = {}
    for name in ["forecast", "stations", "history"]:
        s, j = src.get(f"api/v1/{name}.json")
        if s != 200 or not isinstance(j, dict):
            issues.append(issue("FILE_MISSING", "critical", f"{name}.json is missing", f"HTTP {s or 'no response'}", "rerun"))
        else:
            core[name] = j
    f, stations, hist = core.get("forecast"), core.get("stations"), core.get("history")

    # ---- forecast sanity
    if f:
        bad = []
        live = {r.get("fuel"): r for r in f.get("live", []) if isinstance(r, dict)}
        for fu in FUELS:
            r = live.get(fu)
            if not r: bad.append(f"{fu} missing"); continue
            for k in ["now", "d1", "d3", "d7", "d14", "lo7", "hi7", "p_jump7"]:
                if not num(r.get(k)): bad.append(f"{fu}.{k}={r.get(k)!r}")
            if num(r.get("now")) and not 100 < r["now"] < 500: bad.append(f"{fu}.now={r['now']}")
            if num(r.get("p_jump7")) and not 0 <= r["p_jump7"] <= 1: bad.append(f"{fu}.p_jump7={r['p_jump7']}")
            if num(r.get("d14")) and abs(r["d14"]) > 80: bad.append(f"{fu}.d14={r['d14']}")
            for h in (1, 3, 7, 14):
                lo, hi = r.get(f"lo{h}"), r.get(f"hi{h}")
                if num(lo) and num(hi) and lo > hi: bad.append(f"{fu} lo{h}>hi{h}")
            if not (r.get("verdict") or {}).get("head"): bad.append(f"{fu} has no verdict")
        if bad:
            issues.append(issue("FORECAST_BAD", "critical", "The forecast has impossible values", "; ".join(bad[:8]), "rerun",
                                "If a rerun gives the same values, the model inputs are broken: check store/ on the data branch."))
        facts["medians"] = {fu: live[fu].get("now") for fu in FUELS if fu in live}

    # ---- stations: count, NSW feed freshness, outliers
    if stations:
        lst = [s for s in stations.get("stations", []) if isinstance(s, dict)]
        facts["stations"] = len(lst)
        if len(lst) < STATIONS_CRIT:
            issues.append(issue("STATIONS_FEW", "critical", "Most stations are missing", f"{len(lst)} stations (normally about 866)", "rerun",
                                "NSW FuelCheck may have returned a partial feed."))
        elif len(lst) < STATIONS_WARN:
            issues.append(issue("STATIONS_FEW", "warning", "Fewer stations than usual", f"{len(lst)} stations (normally about 866)", "rerun",
                                "NSW FuelCheck may have returned a partial feed."))
        ages = [s["p"]["U91"][1] for s in lst if "U91" in (s.get("p") or {}) and num(s["p"]["U91"][1])]
        share = sum(a <= 1 for a in ages) / len(ages) if ages else 0
        facts["u91_updated_1d"] = round(share, 2)
        if ages and share < FRESH_SHARE_MIN:
            issues.append(issue("NSW_STALE", "warning", "Station prices look stale",
                                f"Only {share:.0%} of U91 prices changed in the last day (normally 40-60%)", "rerun",
                                "The NSW FuelCheck feed may be lagging. If it lasts a day, check api.nsw.gov.au status."))
        out = []
        for fu in FUELS:
            ps = [(s, s["p"][fu][0]) for s in lst if fu in (s.get("p") or {}) and num(s["p"][fu][0])]
            if not ps: continue
            m = statistics.median(p for _, p in ps)
            out += [f"{s.get('n', '?')} {fu} {p} (median {m:.1f})" for s, p in ps
                    if not ABS_LO <= p <= ABS_HI or not OUT_LO <= p - m <= OUT_HI]
        if out:
            issues.append(issue("PRICE_OUTLIER", "warning", "Implausible station prices are being shown",
                                f"{len(out)}: " + "; ".join(out[:5]), None,
                                "export_api.py should have hidden these (price quarantine). Check that it ran."))
        # a few per-station files, as the station page and widget fetch them
        for s in lst[:: max(1, len(lst) // 3)][:3]:
            sid = str(s.get("id", ""))
            if sid.isdigit() and src.get(f"api/v1/station/{sid}.json")[0] == 404:
                issues.append(issue("STATION_FILES", "warning", "Station pages have no history", f"station/{sid}.json is missing", "rerun"))
                break

    # ---- history: the Sydney median shouldn't leap beyond anything real, or spike and snap back
    if hist:
        try:
            jumps = []
            for fu in FUELS:
                med = [v for v in hist["hist"][fu]["med"][-5:] if num(v)]
                d = [b - a for a, b in zip(med, med[1:])]
                if d and abs(d[-1]) > MEDIAN_JUMP: jumps.append(f"{fu} {med[-2]} → {med[-1]}")
                elif len(d) >= 2 and abs(d[-2]) > SPIKE and abs(d[-1]) > SPIKE and d[-2] * d[-1] < 0:
                    jumps.append(f"{fu} {med[-3]} → {med[-2]} → {med[-1]} (spike and back)")
            if jumps:
                issues.append(issue("MEDIAN_JUMP", "warning", "The Sydney median moved implausibly", "; ".join(jumps), None,
                                    "Most likely a bad snapshot day. Compare with fuelcheck.nsw.gov.au."))
        except (KeyError, TypeError):
            issues.append(issue("FILE_BAD", "critical", "history.json is malformed", "missing hist[fuel].med", "rerun"))

    # ---- what the pipeline itself reported (meta.warnings)
    for w in meta.get("warnings", []) or []:
        w = str(w)
        if w.startswith("tgp_last"):
            issues.append(issue("INPUT_TGP", "warning", "Wholesale prices (AIP) aren't updating", w, None,
                                "The AIP page or file format may have changed: run fetch.py locally and read the error."))
        elif w.startswith("fred_last"):
            issues.append(issue("INPUT_MACRO", "warning", "Oil price and exchange rate aren't updating", w, None,
                                "EIA or RBA may have moved their files: run fetch.py locally and read the error."))
        elif w.startswith("station files unavailable"):
            issues.append(issue("STATION_FILES", "warning", "Station pages have no history", w, "rerun"))
        elif w.startswith("track record unavailable"):
            issues.append(issue("TRACK", "warning", "The track record didn't build", w, "rerun"))
        elif w.startswith("implausible prices hidden"):
            issues.append(issue("QUARANTINED", "info", "Implausible prices were hidden automatically", w))
        else:
            issues.append(issue("META_WARNING", "warning", "The pipeline reported a problem", w, None))
    if meta.get("files") and "track.json" not in meta["files"] and not any(i["code"] == "TRACK" for i in issues):
        issues.append(issue("TRACK", "warning", "The track record is missing", "meta.files has no track.json", "rerun"))

    # ---- the share page behind the app's Share button
    s, _ = src.get("s/")
    if s == 404:
        issues.append(issue("SHARE_PAGE", "warning", "Shared links are broken", "s/ returned 404", "rerun",
                            "export_api.py prints a ::warning:: when it can't publish share.html."))

    hl = meta.get("history_last")
    if hl and (local.date() - dt.date.fromisoformat(hl)).days > HISTORY_LAG_DAYS:
        issues.append(issue("HISTORY_LAG", "info", "NSW monthly history is late", f"latest month ends {hl}"))
    return issues, facts


def report(base=DEFAULT_BASE, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    issues, facts = check(Source(base), now)
    order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: order[i["severity"]])
    return {"checked_at": now.isoformat(timespec="seconds"), "sydney_now": now.astimezone(SYD).isoformat(timespec="minutes"),
            "base": base, "ok": not any(i["severity"] != "info" for i in issues), "issues": issues, "facts": facts}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    if out in args: args.remove(out)
    rep = report(args[0] if args else DEFAULT_BASE)
    txt = json.dumps(rep, indent=1)
    if out: open(out, "w").write(txt)
    print(txt if not out else f"health: {'OK' if rep['ok'] else 'PROBLEMS'}: " + ", ".join(f"{i['severity']}:{i['code']}" for i in rep["issues"]))
