"""Static JSON API for the app/widget, built from the same data as the dashboard.

usage: python export_api.py BASE [OUT] [--allow-stale]   (OUT defaults to BASE/out/site)
Runs build.py unchanged (so the dashboard HTML is rebuilt too) and reuses the `data` it assembles, then writes
  OUT/api/v1/meta.json       schema version, generation time, freshness of each source, file sizes
  OUT/api/v1/forecast.json   per-fuel forecast + verdict, model context, consumer stats, brands, backtest
  OUT/api/v1/stations.json   today's Sydney stations with per-fuel price and "when to fill" advice, suburb centroids
  OUT/api/v1/history.json    daily Sydney median / p10 / p90 per fuel and wholesale TGP since 2019
  OUT/index.html             the dashboard
Exits 1 if the output fails sanity checks (nothing should be published then).
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
data = runpy.run_path(f"{BASE}/pipeline/build.py")["data"]


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
stations = {"schema": SCHEMA, "asof": data["snap_asof"],
            "fields": {"n": "name", "b": "brand", "s": "suburb", "pc": "postcode", "la": "lat", "lo": "lon", "m": "members only (0/1)",
                       "p": "fuel -> [price c/L, days since update, advice code, advice label, advice reason]"},
            "stations": data["stations"], "suburbs": suburbs, "suburb_stats": data["suburbs"]}
history = {"schema": SCHEMA, "start": data["start"], "hist": data["hist"], "tgp": data["tgp"]}

# ---- sanity checks: fail rather than publish something broken or stale
today = dt.datetime.now(ZoneInfo("Australia/Sydney")).date().isoformat()
errs = []
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

api = f"{OUT}/api/v1"; os.makedirs(api, exist_ok=True)
files = {}
for name, obj in [("forecast", forecast), ("stations", stations), ("history", history)]:
    txt = json.dumps(obj, separators=(",", ":"), allow_nan=False)
    open(f"{api}/{name}.json", "w").write(txt); files[f"{name}.json"] = len(txt)
meta = {"schema": SCHEMA, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "asof": ctx["asof"], "stations_asof": data["snap_asof"], "tgp_last": ctx.get("tgp_last"), "fred_last": ctx.get("fred_last"),
        "history_last": ctx.get("history_last"), "live_model": ctx.get("live_model"), "snapshot_days": ctx.get("snapshot_days"),
        "warnings": warnings, "files": files}
json.dump(meta, open(f"{api}/meta.json", "w"), indent=1, allow_nan=False)
shutil.copy(f"{BASE}/out/sydney-pump-outlook.html", f"{OUT}/index.html")
print(f"export_api: {ctx['asof']}, {len(data['stations'])} stations, " + ", ".join(f"{k} {v // 1024}KB" for k, v in files.items())
      + (f"; WARNINGS: {warnings}" if warnings else ""))
