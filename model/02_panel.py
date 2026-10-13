"""Daily station panel + region aggregates + snapshot-style features."""
import numpy as np, pandas as pd

ev = pd.read_parquet("/home/claude/fuel/events.parquet")
FUELS = ["U91", "E10", "P98", "DL"]
ev = ev[ev.fuel.isin(FUELS)].copy()
ev["date"] = ev.ts.dt.normalize()
ev = ev.sort_values(["station", "fuel", "ts"])
ev["prev"] = ev.groupby(["station", "fuel"]).price.shift()
ev["dp"] = ev.price - ev.prev
ev["chg"] = ev.dp.abs() >= 0.5

# one price per station/fuel/day (last of day), and whether a real change happened that day
day = ev.groupby(["station", "fuel", "date"]).agg(price=("price", "last"), chg=("chg", "any"),
                                                   up=("dp", lambda s: (s >= 0.5).any()),
                                                   down=("dp", lambda s: (s <= -0.5).any())).reset_index()
meta = ev.groupby("station").agg(name=("name", "last"), suburb=("suburb", "last"), postcode=("postcode", "last"),
                                 brand=("brand", "last"), region=("region", "last"))
dates = pd.date_range(ev.date.min(), ev.date.max(), freq="D")

panels = []
for (st, f), g in day.groupby(["station", "fuel"]):
    g = g.set_index("date").reindex(dates)
    g["last_chg"] = g.index.to_series().where(g.chg.fillna(False))
    g["price"] = g.price.ffill(limit=120)
    g["last_chg"] = g.last_chg.ffill()
    g[["up", "down", "chg"]] = g[["up", "down", "chg"]].fillna(False)
    g["station"], g["fuel"] = st, f
    panels.append(g.reset_index(names="date"))
P = pd.concat(panels, ignore_index=True)
P = P[P.price.notna()]
P = P.join(meta, on="station")
P["age"] = (P.date - P.last_chg).dt.days
P.to_parquet("/home/claude/fuel/panel.parquet", index=False)
print("panel rows", len(P))


def agg(df):
    a = df.price.values
    rec = df[df.age <= 2]
    old = df[df.age > 7]
    return pd.Series({
        "n": len(a), "median": np.median(a), "mean": a.mean(), "p10": np.percentile(a, 10),
        "p25": np.percentile(a, 25), "p75": np.percentile(a, 75), "p90": np.percentile(a, 90),
        "hikes": int(df.up.sum()), "cuts": int(df.down.sum()),
        "share_upd_1d": (df.age <= 1).mean(), "share_upd_3d": (df.age <= 3).mean(),
        "share_upd_7d": (df.age <= 7).mean(),
        "recent_minus_old": (rec.price.median() - old.price.median()) if len(rec) > 5 and len(old) > 5 else np.nan,
    })


rows = []
for (d, f), g in P.groupby(["date", "fuel"]):
    rows.append(agg(g).rename((d, "NSW", f)))
    for r, gr in g.groupby("region"):
        rows.append(agg(gr).rename((d, r, f)))
A = pd.DataFrame(rows)
A.index = pd.MultiIndex.from_tuples(A.index, names=["date", "region", "fuel"])
A = A.reset_index()
A.to_parquet("/home/claude/fuel/daily_region.parquet", index=False)
print(A[(A.region == "Sydney") & (A.fuel == "U91")].tail(10).round(1).to_string())
