"""One-off: turn Sydney FuelCheck price-change history into the daily store (store/daily.csv).

Input: syd_events_YYYY.csv (sid,fuel,ymd,hhmm,price) and syd_stations.csv, extracted in-browser
from the NSW monthly history files (Sydney postcodes only).
Output columns per (date, fuel) match what pipeline/update.py computes from a live snapshot.
"""
import glob, sys
import numpy as np, pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/Downloads"   # folder with syd_events_*.csv + syd_stations.csv
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/syd/store"
FUELS = ["U91", "E10", "P98", "DL"]

# yearly extracts carry a numeric sid (mapped to an address key via syd_stations.csv);
# monthly extracts made later by pull_history.js carry the address key directly.
stations = pd.read_csv(f"{SRC}/syd_stations.csv", dtype=str)
sid2key = dict(zip(stations.sid.astype(int), stations.key.str.upper().str.replace(r"\s+", " ", regex=True).str.strip()))
parts = []
for f in sorted(glob.glob(f"{SRC}/syd_events_*.csv")):
    e = pd.read_csv(f, dtype={"hhmm": str, "key": str})
    if "sid" in e.columns:
        e["key"] = e.sid.astype(int).map(sid2key)
    else:
        e["key"] = e.key.str.upper().str.replace(r"\s+", " ", regex=True).str.strip()
    parts.append(e[["key", "fuel", "ymd", "hhmm", "price"]])
ev = pd.concat(parts)
ev = ev[ev.fuel.isin(FUELS) & ev.key.notna()]
ev["sid"] = ev.key.astype("category").cat.codes
ev["ts"] = pd.to_datetime(ev.ymd.astype(str) + ev.hhmm.str.zfill(4), format="%Y%m%d%H%M")
ev = ev.drop_duplicates(["sid", "fuel", "ts", "price"]).sort_values(["sid", "fuel", "ts"])
ev["dp"] = ev.groupby(["sid", "fuel"]).price.diff()
ev["date"] = ev.ts.dt.normalize()
print("events", len(ev), ev.ts.min(), ev.ts.max())

rows = []
for f in FUELS:
    e = ev[ev.fuel == f]
    last = e.groupby(["date", "sid"]).price.last().unstack()
    chg = e[e.dp.abs() >= 0.5].groupby(["date", "sid"]).size().unstack().notna()
    up = e[e.dp >= 0.5].groupby("date").size()
    dn = e[e.dp <= -0.5].groupby("date").size()
    dates = pd.date_range(ev.date.min(), ev.date.max())
    last = last.reindex(dates).ffill(limit=120)
    chg = chg.reindex(index=dates, columns=last.columns).fillna(False)
    # date of last real change per station
    lc = pd.DataFrame(np.where(chg.values, dates.values[:, None], np.datetime64("NaT")), index=dates, columns=last.columns).ffill()
    age = (dates.values[:, None] - lc.values).astype("timedelta64[D]").astype(float)
    age[np.isnat(lc.values)] = np.nan
    P = last.values
    for i, d in enumerate(dates):
        p = P[i]; ok = ~np.isnan(p)
        if ok.sum() < 20:
            continue
        a = p[ok]; ag = age[i][ok]
        rec, old = a[ag <= 2], a[ag > 7]
        rows.append(dict(date=d.date(), fuel=f, n=int(ok.sum()), median=np.median(a), mean=a.mean(),
                         p10=np.percentile(a, 10), p25=np.percentile(a, 25), p75=np.percentile(a, 75),
                         p90=np.percentile(a, 90), hikes=int(up.get(d, 0)), cuts=int(dn.get(d, 0)),
                         share_upd_1d=np.nanmean(ag <= 1), share_upd_3d=np.nanmean(ag <= 3),
                         share_upd_7d=np.nanmean(ag <= 7),
                         recent_minus_old=(np.median(rec) - np.median(old)) if len(rec) > 5 and len(old) > 5 else np.nan,
                         source="history"))
D = pd.DataFrame(rows).round(3)
D["date"] = pd.to_datetime(D.date)
# keep live-snapshot rows for days after the newest published history
try:
    old = pd.read_csv(f"{OUT}/daily.csv", parse_dates=["date"])
    snap = old[(old.source == "snapshot") & (old.date > D.date.max())]
    D = pd.concat([D, snap]).sort_values(["date", "fuel"])
except FileNotFoundError:
    pass
D.to_csv(f"{OUT}/daily.csv", index=False, date_format="%Y-%m-%d")
print(D.groupby("fuel").date.agg(["min", "max", "count"]))
print("history to", D[D.source == "history"].date.max().date(), "| snapshot rows kept", int((D.source == "snapshot").sum()))
