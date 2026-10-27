"""Per-station behaviour profile from the NSW price-change history (Sydney stations).

usage: python station_profile.py BASE  -> BASE/store/station_profile.json
For each station (keyed by normalised address) and fuel:
  typ    typical premium vs the Sydney median over the last 365 days of history (c/L)
For each station:
  lag    median hours after a price-jump wave starts before this station hikes
  part   share of Sydney price-jump waves this station joined (low = steady pricer, e.g. Costco)
  n      number of waves it was observed for
Re-run whenever new monthly history arrives (run_daily.sh does this).
"""
import glob, json, os, re, sys
import numpy as np, pandas as pd

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = f"{BASE}/store/events"
from fuels import FUELS
norm = lambda s: re.sub(r"\s+", " ", str(s).upper().replace(",", " ")).strip()

st = pd.read_csv(f"{EV}/syd_stations.csv", dtype=str)
sid2key = dict(zip(st.sid.astype(int), st.key.map(norm)))
parts = []
for f in sorted(glob.glob(f"{EV}/syd_events_*.csv")):
    yr = re.search(r"_(\d{4})", f).group(1)
    if int(yr) < 2024: continue
    e = pd.read_csv(f, dtype={"hhmm": str})
    e["key"] = e.sid.astype(int).map(sid2key) if "sid" in e.columns else e.key.map(norm)
    parts.append(e[["key", "fuel", "ymd", "hhmm", "price"]])
ev = pd.concat(parts, ignore_index=True)
ev = ev[ev.fuel.isin(FUELS) & ev.key.notna() & ev.price.between(50, 600)]
ev["ts"] = pd.to_datetime(ev.ymd.astype(str) + ev.hhmm.str.zfill(4), format="%Y%m%d%H%M")
ev = ev.drop_duplicates(["key", "fuel", "ts", "price"]).sort_values(["key", "fuel", "ts"])
ev["dp"] = ev.groupby(["key", "fuel"]).price.diff()
ev["date"] = ev.ts.dt.normalize()
last = ev.date.max(); since = last - pd.Timedelta(days=365)

D = pd.read_csv(f"{BASE}/store/daily.csv", parse_dates=["date"])
D = D[D.source == "history"]
prof = {}
for f in FUELS:
    e = ev[ev.fuel == f]
    days = pd.date_range(since, last)
    M = e.groupby(["date", "key"]).price.last().unstack().reindex(pd.date_range(e.date.min(), last)).ffill(limit=30).reindex(days)
    med = D[D.fuel == f].set_index("date")["median"].reindex(days)
    prem = M.sub(med, axis=0)
    typ = prem.median(); n = prem.notna().sum()
    for k in typ.index[n >= 60]:
        prof.setdefault(k, {"typ": {}})["typ"][f] = round(float(typ[k]), 1)

# Sydney price-jump waves: a day when 8%+ of active U91 stations hike by 10c+, and 30%+ have hiked within 6 days
h = ev[(ev.fuel == "U91") & (ev.dp >= 10)]
u91 = ev[ev.fuel == "U91"]; act = u91.groupby(u91.date.dt.to_period("M")).key.nunique()
per_day = h.groupby("date").key.nunique()
waves, prev = [], None
for d, v in per_day.items():
    if v < 0.08 * act.get(d.to_period("M"), 1e9): continue
    if prev is None or (d - prev).days > 6:
        n6 = h[(h.date >= d) & (h.date < d + pd.Timedelta(days=6))].key.nunique()
        if n6 >= 0.3 * act.get(d.to_period("M"), 1e9): waves.append(d); prev = d
    else: prev = d
H = ev[ev.fuel.isin(["U91", "E10", "P95", "P98"]) & (ev.dp >= 8)]
first_seen = ev.groupby("key").ts.min()
rows = []
for d0 in waves:
    w = H[(H.ts >= d0 - pd.Timedelta(days=1)) & (H.ts < d0 + pd.Timedelta(days=6))]
    fh = w.groupby("key").ts.min()
    t0 = fh.quantile(0.1)
    for k in first_seen.index[first_seen < d0 - pd.Timedelta(days=7)]:
        rows.append((k, (fh[k] - t0).total_seconds() / 3600 if k in fh.index else np.nan))
R = pd.DataFrame(rows, columns=["key", "lag"])
g = R.groupby("key").agg(n=("lag", "size"), joined=("lag", lambda x: x.notna().mean()), lag=("lag", "median"))
for k, r in g.iterrows():
    p = prof.setdefault(k, {"typ": {}})
    p.update(n=int(r.n), part=round(float(r.joined), 2), lag=None if pd.isna(r.lag) else round(float(r.lag), 1))
lags = [p["lag"] for p in prof.values() if p.get("lag") is not None and p.get("n", 0) >= 4]
out = {"history_last": str(last.date()), "waves": [str(w.date()) for w in waves],
       "lag_median": round(float(np.median(lags)), 1), "stations": prof}
json.dump(out, open(f"{BASE}/store/station_profile.json", "w"), separators=(",", ":"))
print(f"profile: {len(prof)} stations, {len(waves)} waves since 2025, median lag {out['lag_median']}h, history to {last.date()}")
