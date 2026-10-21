"""Static JSON API for the app/widget, built from the same data as the dashboard.

usage: python export_api.py BASE [OUT] [--allow-stale]   (OUT defaults to BASE/out/site)
Runs build.py unchanged (so the dashboard HTML is rebuilt too) and reuses the `data` it assembles, then writes
  OUT/api/v1/meta.json       schema version, generation time, freshness of each source, file sizes
  OUT/api/v1/forecast.json   per-fuel forecast + verdict, model context, consumer stats, brands, backtest
  OUT/api/v1/stations.json   today's Sydney stations with per-fuel price and "when to fill" advice, suburb centroids
  OUT/api/v1/history.json    daily Sydney median / p10 / p90 per fuel and wholesale TGP since 2019
  OUT/api/v1/station/{id}.json  per station (id = NSW station code): 400 days of daily prices, profile, own forecast
                                 (see station_api.py)
  OUT/index.html             the dashboard
Exits 1 if the output fails sanity checks (nothing should be published then). The per-station files fail soft: if they
can't be built or fail their checks, the rest is published without station/ and meta.warnings says why.
"""
import datetime as dt, json, os, runpy, shutil, sys
from zoneinfo import ZoneInfo

args = [a for a in sys.argv[1:] if not a.startswith("--")]
ALLOW_STALE = "--allow-stale" in sys.argv          # read before sys.argv is replaced for build.py
BASE = args[0] if args else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = args[1] if len(args) > 1 else f"{BASE}/out/site"
SCHEMA = 1
FUELS = ["U91", "E10", "P98", "DL"]

sys.argv = ["build.py", BASE]
G = runpy.run_path(f"{BASE}/pipeline/build.py")
data = G["data"]


def verdict(r):   # same rule as verdict() in template.html
    if r["d3"] >= 1.5 or r["p_jump7"] >= 0.5: return {"cls": "up", "head": "Fill up today"}
    if r["d7"] >= 2 or r["p_jump7"] >= 0.35: return {"cls": "up", "head": "Fill up this week"}
    if r["d3"] <= -1.5 or r["d7"] <= -3: return {"cls": "down", "head": "Wait if you can"}
    return {"cls": "flat", "head": "No rush either way"}


ctx = data["ctx"]

# suburb centroids so a suburb/postcode search can be turned into a radius search on the device
cent = {}
for s in data["stations"]:
    c = cent.setdefault((s["s"], s["pc"]), [0.0, 0.0, 0]); c[0] += s["la"]; c[1] += s["lo"]; c[2] += 1
suburbs = sorted(({"s": s, "pc": pc, "la": round(a / n, 5), "lo": round(o / n, 5), "n": n} for (s, pc), (a, o, n) in cent.items()),
                 key=lambda x: (x["s"], x["pc"]))
# `id` (NSW station code) added to each station here, without changing build.py's output. A mismatch with build.py's
# station list is a core failure (ids would be wrong); anything else in the per-station files fails soft (below).
# Same groupby order and lat/lon filter as build.py's `sta` loop; computed here (not in station_api) so it can't fail soft.
errs = []
ids = [str(c) for c, g in G["S"].groupby("code") if not (G["pd"].isna(g.iloc[0].get("lat")) or G["pd"].isna(g.iloc[0].get("lon")))]
if len(ids) != len(data["stations"]) or len(set(ids)) != len(ids):
    errs.append(f"station ids: {len(ids)} ({len(set(ids))} unique) != {len(data['stations'])} stations")
    ids = [None] * len(data["stations"])
app_stations = [dict(id=i, **s) for i, s in zip(ids, data["stations"])]
stations = {"schema": SCHEMA, "asof": data["snap_asof"],
            "fields": {"id": "NSW station code (station/{id}.json)", "n": "name", "b": "brand", "s": "suburb", "pc": "postcode", "la": "lat", "lo": "lon", "m": "members only (0/1)",
                       "p": "fuel -> [price c/L, days since update, advice code, advice label, advice reason]"},
            "stations": app_stations, "suburbs": suburbs, "suburb_stats": data["suburbs"]}
history = {"schema": SCHEMA, "start": data["start"], "hist": data["hist"], "tgp": data["tgp"]}

# ---- sanity checks: fail rather than publish something broken or stale
today = dt.datetime.now(ZoneInfo("Australia/Sydney")).date().isoformat()
if not ALLOW_STALE and (ctx["asof"] != today or data["snap_asof"] != today):
    errs.append(f"stale: forecast asof {ctx['asof']}, stations asof {data['snap_asof']}, today {today}")
if sorted(r["fuel"] for r in data["live"]) != sorted(FUELS): errs.append(f"fuels {[r['fuel'] for r in data['live']]}")
for r in data["live"]:
    for k in ["now", "d1", "d3", "d7", "d14", "p_jump7"]:
        v = r.get(k)
        if not isinstance(v, (int, float)) or v != v: errs.append(f"{r['fuel']}.{k} = {v}")
    if not 100 < r["now"] < 500: errs.append(f"{r['fuel']} now {r['now']}")
if len(data["stations"]) < 500: errs.append(f"only {len(data['stations'])} stations")
if errs:
    print("export_api: FAILED checks:\n  " + "\n  ".join(errs)); sys.exit(1)
forecast = {"schema": SCHEMA, "asof": ctx["asof"], "live": [dict(r, verdict=verdict(r)) for r in data["live"]],
            "ctx": ctx, "stats": data["stats"], "brands": data["brands"], "bt": data["bt"]}

# soft warnings: inputs that the model forward-fills when a best-effort pull keeps failing
age = lambda d: (dt.date.fromisoformat(today) - dt.date.fromisoformat(d)).days if d else 999
warnings = [f"{k} is {age(ctx.get(k))} days old" for k, lim in [("tgp_last", 10), ("fred_last", 21)] if age(ctx.get(k)) > lim]

# per-station files fail soft: on an exception or a failed check, publish everything else without station/ and warn
st_txt = {}
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import station_api
    if station_api.station_ids(G)[0] != ids: raise RuntimeError("station_api ids differ from stations.json ids")
    details = station_api.build(BASE, G, SCHEMA)
    st_errs = station_api.check(details, app_stations)
    if st_errs: raise RuntimeError(f"{len(st_errs)} check(s) failed, e.g. {'; '.join(st_errs[:3])}")
    st_txt = {i: json.dumps(d, separators=(",", ":"), allow_nan=False) for i, d in details.items()}
except Exception as e:
    st_txt = {}; warnings.append(f"station files unavailable: {type(e).__name__}: {e}"[:500])
    print("!" * 70 + f"\nexport_api: WARNING {warnings[-1]}\n  publishing without station/\n" + "!" * 70)

api = f"{OUT}/api/v1"; os.makedirs(api, exist_ok=True)
files = {}
for name, obj in [("forecast", forecast), ("stations", stations), ("history", history)]:
    txt = json.dumps(obj, separators=(",", ":"), allow_nan=False)
    open(f"{api}/{name}.json", "w").write(txt); files[f"{name}.json"] = len(txt)
shutil.rmtree(f"{api}/station", ignore_errors=True)
sizes = sorted(len(t) for t in st_txt.values())
if st_txt:
    os.makedirs(f"{api}/station")
    for i, txt in st_txt.items(): open(f"{api}/station/{i}.json", "w").write(txt)
    files["station/"] = sum(sizes); files["station/count"] = len(sizes)
meta = {"schema": SCHEMA, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "asof": ctx["asof"], "stations_asof": data["snap_asof"], "tgp_last": ctx.get("tgp_last"), "fred_last": ctx.get("fred_last"),
        "history_last": ctx.get("history_last"), "live_model": ctx.get("live_model"), "snapshot_days": ctx.get("snapshot_days"),
        "warnings": warnings, "files": files}
json.dump(meta, open(f"{api}/meta.json", "w"), indent=1, allow_nan=False)
shutil.copy(f"{BASE}/out/sydney-pump-outlook.html", f"{OUT}/index.html")
print(f"export_api: {ctx['asof']}, {len(data['stations'])} stations, " + ", ".join(f"{k} {v // 1024}KB" for k, v in files.items() if k != "station/count")
      + (f"; station files {len(sizes)}, p50 {sizes[len(sizes) // 2] // 1024}KB, max {sizes[-1] // 1024}KB" if sizes else "; NO station files")
      + (f"; WARNINGS: {warnings}" if warnings else ""))
