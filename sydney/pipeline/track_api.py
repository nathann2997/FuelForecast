"""Track record for the app: Bowser's daily "fill or wait" calls and how each turned out (api/v1/track.json).

Called by export_api.py (the app path only; the Claude task never runs it). Two sources:
  live    store/calls.csv: the first call of each Sydney day per fuel, appended (append()) at the end of every successful run and
          kept on the `data` branch with the rest of store/. The first call is the morning one most people act on, and
          keeping it means a call is never revised with hindsight.
  replay  the same verdict rule applied to the walk-forward backtest (store/backtest_preds.parquet, the production
          model's 3- and 7-day predictions, and backtest_cls.parquet, the jump chance): what Bowser would have said.
Scoring, one rule for both (Sydney medians from store/daily.csv):
  move = average median over the WINDOW days after the call - the median on the call day
         (pending until the window's last day is over, i.e. before the latest day in daily.csv, and MIN_DAYS of its days
         are known)
  A live call's "median on the call day" is the one it was made with (the morning snapshot); a replayed call's is that
  day's end-of-day median, so on a jump day a live "fill" call scores a little better than its replay would.
  up   (fill)     right if move >= +1c, wrong if <= -1c, else close
  down (wait)     right if move <= -1c, wrong if >= +1c, else close
  flat (no rush)  right if |move| < 3c, wrong if >= 5c, else close
The app's fill savings use the same window (app/src/lib/savings.ts), so "the week after" means the same on both screens.
"""
import csv, datetime as dt, json, os

import pandas as pd

FUELS = ["U91", "E10", "P98", "DL"]
WINDOW, MIN_DAYS = 7, 5
KEEP_DAYS = 60          # live calls listed in track.json (the summary counts all of them)
FIELDS = ["date", "fuel", "cls", "head", "now", "d3", "d7", "p_jump7"]


def score(cls, move):
    if move is None: return "pending"
    if cls == "up": return "right" if move >= 1 else "wrong" if move <= -1 else "close"
    if cls == "down": return "right" if move <= -1 else "wrong" if move >= 1 else "close"
    return "right" if abs(move) < 3 else "wrong" if abs(move) >= 5 else "close"


def medians(base):
    """{fuel: {date: median}} from store/daily.csv, and the last date it covers"""
    d = pd.read_csv(f"{base}/store/daily.csv", usecols=["date", "fuel", "median"]).dropna()
    med = {f: dict(zip(g["date"], g["median"].astype(float))) for f, g in d.groupby("fuel")}
    return med, d["date"].max()


def window(med, fuel, date, last):
    """(average median over the WINDOW days after `date`, days known, complete?)"""
    day = dt.date.fromisoformat(date)
    vals = [med.get(fuel, {}).get((day + dt.timedelta(k)).isoformat()) for k in range(1, WINDOW + 1)]
    vals = [v for v in vals if v is not None]
    # Complete once the window's last day is over: `last` (today) is a partial day while the day's runs go on
    done = (day + dt.timedelta(WINDOW)).isoformat() < last and len(vals) >= MIN_DAYS
    return (sum(vals) / len(vals) if vals else None), len(vals), done


def todays_calls(base, asof, live, verdict):
    """Today's calls (one per fuel) not yet in store/calls.csv. export_api scores them with the rest (build(extra=...))
    and only appends them (append()) once everything has been written, so a run that fails later records nothing."""
    path = f"{base}/store/calls.csv"
    have = set()
    if os.path.exists(path):
        with open(path, newline="") as fh: have = {(r.get("date"), r.get("fuel")) for r in csv.DictReader(fh)}
    new = []
    for r in live:
        if (asof, r["fuel"]) in have: continue
        v = verdict(r)
        new.append({"date": asof, "fuel": r["fuel"], "cls": v["cls"], "head": v["head"], "now": round(r["now"], 1),
                    "d3": round(r["d3"], 2), "d7": round(r["d7"], 2), "p_jump7": round(r["p_jump7"], 3)})
    return new


def append(base, rows):
    if not rows: return
    path = f"{base}/store/calls.csv"
    first = not os.path.exists(path)
    with open(path, "a", newline="") as fh:
        w = csv.DictWriter(fh, FIELDS)
        if first: w.writeheader()
        w.writerows(rows)


def tally(rows):
    out = {}
    for f in FUELS:
        rs = [r for r in rows if r["fuel"] == f and r["status"] != "pending"]
        out[f] = {"n": len(rs), **{k: sum(r["status"] == k for r in rs) for k in ["right", "close", "wrong"]},
                  "from": min((r["date"] for r in rs), default=None), "to": max((r["date"] for r in rs), default=None)}
    return out


def live_calls(base, med, last, extra=()):
    """Scored calls from store/calls.csv plus `extra` (today's, not saved yet). A damaged row is skipped, not fatal:
    one bad line must not hide the track record every day after it."""
    path = f"{base}/store/calls.csv"
    raw = []
    if os.path.exists(path):
        with open(path, newline="") as fh: raw = list(csv.DictReader(fh))
    rows = []
    for r in [*raw, *extra]:
        try:
            now, date = float(r["now"]), str(r["date"])
            dt.date.fromisoformat(date)
        except (KeyError, TypeError, ValueError):
            continue
        if r.get("fuel") not in FUELS or r.get("cls") not in ("up", "down", "flat") or not 100 < now < 500: continue
        avg, n, done = window(med, r["fuel"], date, last)
        move = round(avg - now, 1) + 0.0 if avg is not None else None
        # `move` so far is shown for a pending call too (with `days`); the status waits for the whole window
        rows.append({"date": date, "fuel": r["fuel"], "cls": r["cls"], "head": str(r.get("head", ""))[:40], "now": now,
                     "move": move, "days": n, "status": score(r["cls"], move if done else None)})
    return sorted(rows, key=lambda r: (r["date"], FUELS.index(r["fuel"])), reverse=True)


def replay(base, med, last, verdict, live_model=None):
    """The verdict rule replayed on the walk-forward backtest; None if the backtest files aren't there. The model column
    follows the one running live (model.py: "full (with cycle memory)", or "no cycle memory" while daily history has a
    gap), else backtest.json's production model."""
    try:
        prod = json.load(open(f"{base}/store/backtest.json"))["prod"]
        P = pd.read_parquet(f"{base}/store/backtest_preds.parquet")
        C = pd.read_parquet(f"{base}/store/backtest_cls.parquet")
    except (OSError, KeyError, ValueError):
        return None
    col = "+cycle memory" if str(live_model or "").startswith("full") else "+oil & AUD" if live_model else prod
    if col not in P.columns: col = prod
    w = P[P["h"].isin([3, 7])].pivot_table(index=["date", "fuel"], columns="h", values=col)
    w = w.rename(columns={3: "d3", 7: "d7"}).join(C.set_index(["date", "fuel"])["p"].rename("p_jump7")).dropna().reset_index()
    rows = []
    for r in w.itertuples(index=False):
        date = pd.Timestamp(r.date).date().isoformat()
        now = med.get(r.fuel, {}).get(date)
        if now is None: continue
        avg, _, done = window(med, r.fuel, date, last)
        if not done: continue
        cls = verdict({"d3": r.d3, "d7": r.d7, "p_jump7": r.p_jump7})["cls"]
        rows.append({"date": date, "fuel": r.fuel, "status": score(cls, avg - now)})
    return tally(rows)


def build(base, verdict, schema, stamp, extra=(), live_model=None):
    med, last = medians(base)
    calls = live_calls(base, med, last, extra)
    cutoff = (dt.date.fromisoformat(last) - dt.timedelta(KEEP_DAYS)).isoformat()
    since = {f: min((c["date"] for c in calls if c["fuel"] == f), default=None) for f in FUELS}
    live = {f: dict(t, since=since[f]) for f, t in tally(calls).items()}
    return {"schema": schema, **stamp, "asof": last, "window": WINDOW, "min_days": MIN_DAYS,
            "calls": [c for c in calls if c["date"] >= cutoff], "live": live, "replay": replay(base, med, last, verdict, live_model)}


def check(t):
    errs = []
    for c in t["calls"]:
        if c["fuel"] not in FUELS or c["cls"] not in ("up", "down", "flat") or c["status"] not in ("right", "close", "wrong", "pending"):
            errs.append(f"bad call {c}")
        if not 100 < c["now"] < 500: errs.append(f"call now {c['now']}")
    for part in ("live", "replay"):
        for f, s in (t[part] or {}).items():
            if s["right"] + s["close"] + s["wrong"] != s["n"]: errs.append(f"{part} {f} counts {s}")
    return errs
