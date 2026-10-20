"""Assemble dashboard data (stats + forecast + backtest) and render the HTML page.

usage: python build.py BASE  -> BASE/out/sydney-pump-outlook.html
"""
import json, os, sys
import numpy as np, pandas as pd

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = f"{BASE}/store"
D = pd.read_csv(f"{STORE}/daily.csv", parse_dates=["date"])
T = pd.read_csv(f"{STORE}/tgp.csv", parse_dates=["date"]).set_index("date")
FC = json.load(open(f"{STORE}/forecast.json")); BT = json.load(open(f"{STORE}/backtest.json"))
ST = json.load(open(f"{STORE}/stations_today.json"))
r1 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1)
asof = pd.Timestamp(FC["ctx"]["asof"])
start = pd.Timestamp("2019-01-01"); days = pd.date_range(start, asof)

hist = {}
for f in ["U91", "E10", "P98", "DL"]:
    g = D[D.fuel == f].set_index("date").reindex(days)
    hist[f] = {"med": [r1(v) for v in g["median"]], "p10": [r1(v) for v in g.p10], "p90": [r1(v) for v in g.p90]}
Tg = T.reindex(days).ffill(limit=4)
tgp = {"ulp": [r1(v) for v in Tg.tgp_ulp], "dl": [r1(v) for v in Tg.tgp_dl]}

# ---- consumer stats (Sydney U91)
u = D[D.fuel == "U91"].set_index("date")["median"].reindex(days)
rise = (u - u.shift(3)) >= 8
starts, last = [], None
for d, v in rise.items():
    if v and (last is None or (d - last).days >= 10): starts.append(d)
    if v: last = d
cyc = []
for i, s in enumerate(starts):
    peak = u[s:s + pd.Timedelta(days=6)].max(); trough = u[s - pd.Timedelta(days=6):s].min()
    gap = (starts[i + 1] - s).days if i + 1 < len(starts) else None
    cyc.append(dict(date=s, amp=peak - trough, gap=gap))
C = pd.DataFrame(cyc); C["year"] = C.date.dt.year
by_year = [{"year": int(y), "n": int(len(g)), "gap": r1(g.gap.median()), "amp": r1(g.amp.median())} for y, g in C.groupby("year")]
calm = u[(u.index < "2022-02-01") | ((u.index >= "2022-10-01") & (u.index < "2026-03-01"))]
dev = (calm - calm.rolling(7, center=True).mean()).groupby(calm.index.dayofweek).mean()
syd = D.set_index(["date", "fuel"])
def spread(f, a, b): return r1((syd.xs(f, level="fuel")[a] - syd.xs(f, level="fuel")[b]).loc["2023-01-01":].mean())
dl_gap = (D[D.fuel == "DL"].set_index("date")["median"] - u).dropna()
tgu = T.tgp_ulp.reindex(days).ffill().shift(1)
margin = (u - tgu).dropna()
last_restore = starts[-1] if starts else None

# ---- today's stations
S = pd.DataFrame(ST["rows"])
uu = S[S.fueltype == "U91"].copy(); med = uu.price.median(); uu["prem"] = uu.price - med
brands = uu.groupby("brand").agg(n=("price", "size"), prem=("prem", "mean")).query("n >= 8").sort_values("prem")
subs = []
for (sub, pc), g in uu.groupby(["suburb", "postcode"]):
    g = g.sort_values("price"); dl = S[(S.fueltype == "DL") & (S.postcode == pc)].sort_values("price")
    subs.append({"sub": sub, "pc": int(pc), "n": int(len(g)), "med": r1(g.price.median()), "min": r1(g.price.iloc[0]),
                 "minName": g.name.iloc[0], "minAge": int(g.age.iloc[0]) if pd.notna(g.age.iloc[0]) else None,
                 "dlmin": r1(dl.price.iloc[0]) if len(dl) else None})

stats = {
    "cycles_by_year": by_year,
    "cycle_gap_calm": r1(C[(C.date < "2022-02-01") | ((C.date >= "2022-10-01") & (C.date < "2026-03-01"))].gap.median()),
    "cycle_amp_calm": r1(C[(C.date < "2022-02-01") | ((C.date >= "2022-10-01") & (C.date < "2026-03-01"))].amp.median()),
    "last_restore": str(last_restore.date()) if last_restore is not None else None,
    "dow": [r1(v) for v in dev.reindex(range(7))],
    "shop_around": spread("U91", "median", "p10"),
    "p98_prem": r1((syd.xs("P98", level="fuel")["median"] - u.reindex(syd.xs("P98", level="fuel").index)).loc["2023-01-01":].mean()),
    "e10_disc": r1((u.reindex(syd.xs("E10", level="fuel").index) - syd.xs("E10", level="fuel")["median"]).loc["2023-01-01":].mean()),
    "dl_gap_now": r1(dl_gap.iloc[-1]), "dl_gap_2019_25": r1(dl_gap.loc["2019":"2025"].mean()),
    "margin_now": r1(margin.iloc[-1]), "margin_typ": r1(margin.loc["2019":"2025"].median()),
    "low_2019": r1(u.loc["2019":].min()), "high_all": r1(u.max()), "high_date": str(u.idxmax().date()),
}

# ---- per-station "when to fill" advice: Sydney forecast path for the fuel, adjusted for how this
# station usually behaves (its typical premium, how fast it follows price-jump waves, whether it cycles at all)
PF = json.load(open(f"{STORE}/station_profile.json")) if os.path.exists(f"{STORE}/station_profile.json") else {"stations": {}, "lag_median": 48}
LIVE = {r["fuel"]: r for r in FC["live"]}
dow = lambda k: (asof + pd.Timedelta(days=int(k))).strftime("%a %-d %b")
def market(f):
    r = LIVE[f]; hs = np.arange(15)
    d = np.interp(hs, [0, 1, 3, 7, 14], [0, r["d1"], r["d3"], r["d7"], r["d14"]])
    J = next((int(h) for h in hs[1:] if d[h] >= 5), None)            # first day the median is expected 5c+ higher
    # jump classifier: P(5c+ jump within 7 days) -> constant daily hazard -> first day the cumulative risk passes 25%
    p7 = min(max(r["p_jump7"], 1e-3), 0.99); lam = 1 - (1 - p7) ** (1 / 7)
    k = int(np.floor(np.log(0.75) / np.log(1 - lam))) + 1
    if k <= 14: J = min(J or 99, k)
    return r, d, J
MK = {f: market(f) for f in LIVE}
def advise(f, price, age, key):
    r, d, J = MK[f]; p = PF["stations"].get(key, {})
    typ = p.get("typ", {}).get(f); xs = None if typ is None else price - r["now"] - typ
    if age is not None and age > 10:
        return ["chk", "Check price", f"Not updated for {age} days"]
    if p.get("n", 0) >= 5 and p.get("part", 1) < 0.25:
        return ["any", "Any time", "Steady pricer, rarely joins price jumps" + (f"; usually {abs(typ):.0f}c under the median" if typ is not None and typ < -2 else "")]
    if J is not None:
        lag = p.get("lag"); shift = 0 if lag is None else int(np.clip(round((lag - PF["lag_median"]) / 24), -1, 2))
        by = max(J - 1 + shift, 0)
        if xs is not None and xs >= 8:
            return ["hi", "Skip for now", f"Already {xs:.0f}c above its usual vs the median"]
        why = f"Sydney {f} likely to rise from {dow(J)}" + (f", about +{d[14]:.0f}c by {dow(14)}" if d[14] >= 3 else "") + \
              ("; this station is usually slow to follow" if shift > 0 else "; this station is usually quick to rise" if shift < 0 else "")
        if xs is not None and xs <= -6:
            return ["now", "Fill now", f"{abs(xs):.0f}c below its usual, and prices are set to rise"]
        if by <= 1: return ["now", "Fill now", why]
        return ["by", f"Fill by {dow(by)}", why]
    if xs is not None and xs >= 8:
        return ["wait", "Wait", f"{xs:.0f}c above its usual vs the median; likely to ease"]
    if d[7] <= -2:
        return ["wait", "Wait", f"Sydney {f} expected about {abs(d[7]):.0f}c lower by {dow(7)}"]
    return ["ok", "No rush", "No rise expected in the next 2 weeks"]
sta = []
for code, g in S.groupby("code"):
    r0 = g.iloc[0]
    if pd.isna(r0.get("lat")) or pd.isna(r0.get("lon")): continue
    sub = r0.suburb if isinstance(r0.suburb, str) and r0.suburb.strip() else f"Postcode {int(r0.postcode)}"
    sta.append({"n": r0["name"], "b": r0.brand if isinstance(r0.brand, str) else "Independent", "s": sub, "pc": int(r0.postcode), "la": round(float(r0.lat), 5), "lo": round(float(r0.lon), 5),
                "m": int("members only" in str(r0["name"]).lower()),
                "p": {f: [r1(x.price), int(x.age) if pd.notna(x.age) else None] + advise(f, float(x.price), int(x.age) if pd.notna(x.age) else None, r0.get("key")) for f, x in g.set_index("fueltype").iterrows()}})
data = {"stations": sta, "start": str(start.date()), "hist": hist, "tgp": tgp, "live": FC["live"], "ctx": FC["ctx"], "bt": BT,
        "stats": stats, "brands": [{"brand": b, "n": int(r.n), "prem": r1(r.prem)} for b, r in brands.iterrows()],
        "suburbs": subs, "snap_asof": ST["asof"]}
tpl = open(f"{BASE}/pipeline/template.html").read()
os.makedirs(f"{BASE}/out", exist_ok=True)
open(f"{BASE}/out/sydney-pump-outlook.html", "w").write(tpl.replace("__DATA__", json.dumps(data, separators=(",", ":"))))
print("built", asof.date(), len(json.dumps(data)) // 1024, "KB", stats)
