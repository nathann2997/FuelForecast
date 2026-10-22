"""Static JSON API for the app/widget, built from the same data as the dashboard.

usage: python export_api.py BASE [OUT] [--allow-stale]   (OUT defaults to BASE/out/site)
Runs build.py unchanged (so the dashboard HTML is rebuilt too) and reuses the `data` it assembles, then writes
  OUT/api/v1/meta.json       schema version, generation time, freshness of each source, file sizes
  OUT/api/v1/forecast.json   per-fuel forecast + verdict, model context, consumer stats, brands, backtest
  OUT/api/v1/stations.json   today's Sydney stations with per-fuel price and "when to fill" advice, suburb centroids
  OUT/api/v1/history.json    daily Sydney median / p10 / p90 per fuel and wholesale TGP since 2019
  OUT/api/v1/track.json      the track record: recent live calls and how they turned out, plus the replayed backtest
                             (see track_api.py; records today's calls in BASE/store/calls.csv)
  OUT/api/v1/station/{id}.json  per station (id = NSW station code): 400 days of daily prices, profile, own forecast
                                 (see station_api.py)
  OUT/index.html             the dashboard (its source credits rewritten for this pipeline, see DASHBOARD_CREDITS)
  OUT/s/index.html           the share page for the app's Share link (share.html, with a hash CSP)
Every file carries `generated_at` (UTC, when this export ran: the app's "Refreshed" time); the top-level files also carry
`attribution` and `license_note`, and meta.json has the full licence and source list (LICENSE below). See DATA-LICENSE.md.
Exits 1 if the output fails sanity checks (nothing should be published then). The per-station files fail soft: if they
can't be built or fail their checks, the rest is published without station/ and meta.warnings says why.
"""
import base64, datetime as dt, hashlib, json, os, re, runpy, shutil, statistics, sys
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


GENERATED_AT = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")   # one time for every file of this run

# ---- licence and attribution (DATA-LICENSE.md). NSW FuelCheck data is CC BY-SA 3.0 AU, so these files (adaptations of
# it) are released under the same licence. AIP's wholesale prices and the Brent and AUD/USD figures are not covered.
# The FuelCheck licence version: data.nsw.gov.au's monthly history files say "CC BY-SA 3.0 Australia".
CC = "https://creativecommons.org/licenses/by-sa/3.0/au/"
ATTRIBUTION = ("Contains NSW Government FuelCheck data © State of New South Wales (NSW Fair Trading), licensed under CC BY-SA 3.0 AU; "
               "prices adapted and forecasts added by Bowser. Wholesale terminal gate prices: © Australian Institute of Petroleum. "
               "Brent crude: U.S. Energy Information Administration (from Refinitiv, an LSEG business). AUD/USD: Reserve Bank of "
               "Australia (from WM/Reuters).")
LICENSE = {
    "name": "CC BY-SA 3.0 AU", "url": CC, "attribution": ATTRIBUTION,
    "excluded": "Not licensed under CC BY-SA: wholesale terminal gate prices and figures derived from them (history.json tgp; "
                "forecast.json live[].tgp, live[].margin, stats.margin_now, stats.margin_typ), © Australian Institute of Petroleum, "
                "all rights reserved; and the Brent crude and AUD/USD figures (forecast.json ctx.brent_usd, ctx.brent_aud, ctx.audusd), "
                "which remain subject to their publishers' and data vendors' terms.",
    "sources": [
        {"name": "NSW FuelCheck live prices and monthly price history", "publisher": "NSW Fair Trading (Department of Customer Service)",
         "terms": "CC BY-SA 3.0 AU", "url": "https://data.nsw.gov.au/data/dataset/fuel-check"},
        {"name": "Brent crude spot price (RBRTE)", "publisher": "U.S. Energy Information Administration (source: Refinitiv, an LSEG business)",
         "terms": "EIA copyright and reuse policy; not relicensed here", "url": "https://www.eia.gov/dnav/pet/hist/RBRTED.htm"},
        {"name": "AUD/USD exchange rate (F11.1, FXRUSD)", "publisher": "Reserve Bank of Australia (source: WM/Reuters)",
         "terms": "RBA copyright notice; third-party data; not relicensed here", "url": "https://www.rba.gov.au/statistics/tables/"},
        {"name": "Terminal gate prices", "publisher": "Australian Institute of Petroleum",
         "terms": "© AIP, all rights reserved; not licensed here", "url": "https://www.aip.com.au/historical-ulp-and-diesel-tgp-data"},
    ],
}
STAMP = {"generated_at": GENERATED_AT, "license_note": f"CC BY-SA 3.0 AU {CC}, with exclusions: see meta.json license", "attribution": ATTRIBUTION}

# The dashboard template is shared with the Claude scheduled task, which still credits FRED; only this pipeline's
# published copy gets the sources it actually used and the NSW licence.
DASHBOARD_CREDITS = [
    ("monthly price history on data.nsw.gov.au;",
     "monthly price history on data.nsw.gov.au (© State of NSW, NSW Fair Trading, CC BY-SA 3.0 AU; adapted, with forecasts added);"),
    ("Brent crude (DCOILBRENTEU) and AUD/USD (DEXUSAL) from FRED, Federal Reserve Bank of St. Louis.",
     "Brent crude from the U.S. Energy Information Administration (Refinitiv) and AUD/USD from the Reserve Bank of Australia (WM/Reuters)."),
    ('"Brent and AUD (FRED)"', '"Brent (EIA) and AUD (RBA)"'),
]


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
# ---- price quarantine. A price far from its fuel's Sydney median is almost always a slip at the station (23.9 for 239.9);
# shown, it would rank as the cheapest in Sydney, top "Best for you" and the widget. So it's left out of the app's data
# (new dicts: build.py's `data` and the dashboard are untouched) and reported in meta.warnings. The bounds are well
# outside anything real: across the stored snapshots the widest gaps are -22c and +37c. health.py checks the same bounds.
QUAR_LO, QUAR_HI, QUAR_ABS = -45, 80, (80, 600)
quarantined = []
for f in FUELS:
    ps = [st["p"][f][0] for st in app_stations if isinstance((st["p"].get(f) or [None])[0], (int, float))]
    if len(ps) < 50: continue   # too few to know what normal is
    med = statistics.median(ps)
    quarantined += [(st["id"], f, st["p"][f][0], round(med, 1), st["n"]) for st in app_stations
                    if isinstance((st["p"].get(f) or [None])[0], (int, float))
                    and not (QUAR_ABS[0] <= st["p"][f][0] <= QUAR_ABS[1] and QUAR_LO <= st["p"][f][0] - med <= QUAR_HI)]
if quarantined:
    qset = {(i, f) for i, f, *_ in quarantined}
    app_stations = [dict(st, p={f: pr for f, pr in st["p"].items() if (st["id"], f) not in qset}) for st in app_stations]
stations = {"schema": SCHEMA, "asof": data["snap_asof"], **STAMP,
            "fields": {"id": "NSW station code (station/{id}.json)", "n": "name", "b": "brand", "s": "suburb", "pc": "postcode", "la": "lat", "lo": "lon", "m": "members only (0/1)",
                       "p": "fuel -> [price c/L, days since update, advice code, advice label, advice reason, "
                            "7-day forecast price c/L (= station/{id}.json fc.now + fc.d7; absent if station files failed)]"},
            "stations": app_stations, "suburbs": suburbs, "suburb_stats": data["suburbs"]}
history = {"schema": SCHEMA, **STAMP, "start": data["start"], "hist": data["hist"], "tgp": data["tgp"]}

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
forecast = {"schema": SCHEMA, "asof": ctx["asof"], **STAMP, "live": [dict(r, verdict=verdict(r)) for r in data["live"]],
            "ctx": ctx, "stats": data["stats"], "brands": data["brands"], "bt": data["bt"]}

# soft warnings: inputs that the model forward-fills when a best-effort pull keeps failing
age = lambda d: (dt.date.fromisoformat(today) - dt.date.fromisoformat(d)).days if d else 999
warnings = [f"{k} is {age(ctx.get(k))} days old" for k, lim in [("tgp_last", 10), ("fred_last", 21)] if age(ctx.get(k)) > lim]
if quarantined:
    warnings.append(("implausible prices hidden: " + "; ".join(f"{n} {f} {p} (median {m})" for _, f, p, m, n in quarantined[:5])
                     + (f" and {len(quarantined) - 5} more" if len(quarantined) > 5 else ""))[:500])
    print(f"export_api: quarantined {len(quarantined)} implausible price(s): {quarantined[:5]}")

# per-station files fail soft: on an exception or a failed check, publish everything else without station/ (and
# stations.json without the 7-day price at p[fuel][5]) and warn
st_txt = {}
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import station_api
    if station_api.station_ids(G)[0] != ids: raise RuntimeError("station_api ids differ from stations.json ids")
    details = station_api.build(BASE, G, SCHEMA)
    for i, f, *_ in quarantined:   # the station page leaves the hidden fuel out too, so it agrees with the list
        details.get(i, {}).get("fc", {}).pop(f, None); details.get(i, {}).get("hist", {}).pop(f, None)
    st_errs = station_api.check(details, app_stations)
    if st_errs: raise RuntimeError(f"{len(st_errs)} check(s) failed, e.g. {'; '.join(st_errs[:3])}")
    st_txt = {i: json.dumps(dict(d, generated_at=GENERATED_AT), separators=(",", ":"), allow_nan=False) for i, d in details.items()}
    # p[fuel][5]: the 7-day forecast price from the same fc, for the widget (new dicts/lists: build.py's data untouched)
    f7 = lambda fc: round(fc["now"] + fc["d7"], 1) + 0.0
    # index 5 (7-day station forecast) belongs to this script; build.py fills 0-4 only
    with_fc = [dict(s, p={f: list(pr[:5]) + [f7(details[s["id"]]["fc"][f])] for f, pr in s["p"].items()}) for s in app_stations]
    bad = [f"{s['id']} {f}" for s in with_fc for f, pr in s["p"].items()
           if len(pr) != 6 or not isinstance(pr[5], float) or pr[5] != pr[5] or not 50 < pr[5] < 800
           or pr[5] != f7(json.loads(st_txt[s["id"]])["fc"][f])]
    if bad: raise RuntimeError(f"stations.json 7-day price check failed for {len(bad)}, e.g. {bad[:3]}")
    stations["stations"] = with_fc
except Exception as e:
    # Published in meta.json: keep it to the error, not the runner's file paths
    st_txt = {}; warnings.append(re.sub(r"(?<![\w.:/-])(?:/[\w.-]+)+/", "", f"station files unavailable: {type(e).__name__}: {e}")[:500])
    print("!" * 70 + f"\nexport_api: WARNING {warnings[-1]}\n  publishing without station/\n" + "!" * 70)

# track record (track_api.py) fails soft too: today's calls (not on --allow-stale runs, whose data isn't today's) are
# scored with the saved ones and the replayed backtest, and only saved to store/calls.csv at the very end, once every
# file has been written; on any error, publish without track.json and warn
track_txt, new_calls = None, []
try:
    if os.path.dirname(os.path.abspath(__file__)) not in sys.path: sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import track_api
    if not ALLOW_STALE: new_calls = track_api.todays_calls(BASE, ctx["asof"], data["live"], verdict)
    track = track_api.build(BASE, verdict, SCHEMA, STAMP, extra=new_calls, live_model=ctx.get("live_model"))
    t_errs = track_api.check(track)
    if t_errs: raise RuntimeError(f"{len(t_errs)} check(s) failed, e.g. {'; '.join(t_errs[:3])}")
    track_txt = json.dumps(track, separators=(",", ":"), allow_nan=False)
except Exception as e:
    new_calls = []
    warnings.append(re.sub(r"(?<![\w.:/-])(?:/[\w.-]+)+/", "", f"track record unavailable: {type(e).__name__}: {e}")[:500])
    print("!" * 70 + f"\nexport_api: WARNING {warnings[-1]}\n  publishing without track.json\n" + "!" * 70)

api = f"{OUT}/api/v1"; os.makedirs(api, exist_ok=True)
files = {}
for name, obj in [("forecast", forecast), ("stations", stations), ("history", history)]:
    txt = json.dumps(obj, separators=(",", ":"), allow_nan=False)
    open(f"{api}/{name}.json", "w").write(txt); files[f"{name}.json"] = len(txt)
if track_txt is not None:
    open(f"{api}/track.json", "w").write(track_txt); files["track.json"] = len(track_txt)
elif os.path.exists(f"{api}/track.json"): os.remove(f"{api}/track.json")
shutil.rmtree(f"{api}/station", ignore_errors=True)
sizes = sorted(len(t) for t in st_txt.values())
if st_txt:
    os.makedirs(f"{api}/station")
    for i, txt in st_txt.items():
        # The id is the NSW station code and becomes a file name: digits only, so "../forecast" can't overwrite a file
        if re.fullmatch(r"\d+", str(i)): open(f"{api}/station/{i}.json", "w").write(txt)
        else: print(f"export_api: WARNING skipped station file for a non-numeric code {str(i)[:20]!r}")
    files["station/"] = sum(sizes); files["station/count"] = len(os.listdir(f"{api}/station"))
meta = {"schema": SCHEMA, "generated_at": GENERATED_AT, "license": LICENSE,
        "asof": ctx["asof"], "stations_asof": data["snap_asof"], "tgp_last": ctx.get("tgp_last"), "fred_last": ctx.get("fred_last"),
        "history_last": ctx.get("history_last"), "live_model": ctx.get("live_model"), "snapshot_days": ctx.get("snapshot_days"),
        "warnings": warnings, "files": files}
json.dump(meta, open(f"{api}/meta.json", "w"), indent=1, allow_nan=False)
html = open(f"{BASE}/out/sydney-pump-outlook.html", encoding="utf-8").read()
for old, new in DASHBOARD_CREDITS:
    if old in html: html = html.replace(old, new)
    else: print(f"export_api: WARNING dashboard credit not found: {old[:60]!r}")
# Content-Security-Policy for the published copy only (the template is shared with the Claude scheduled task, whose
# artifact host wraps the page). Added after the credit rewrite, so it can pin the page's own inline script by hash:
# an injected <script> or on*= handler won't run, nothing loads from anywhere but cdnjs (Chart.js, which also carries
# SRI) and Google Fonts, and the page can't make network requests, frames or form posts.
inline = re.findall(r"<script>(.*?)</script>", html, re.S)
# Any inline <script ...> with attributes would be blocked by the CSP: refuse to publish rather than ship a dead page
n_inline = len(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>", html))
if len(inline) != 1 or n_inline != 1: raise RuntimeError(f"dashboard: expected 1 inline script, found {n_inline}")
sha = base64.b64encode(hashlib.sha256(inline[0].encode()).digest()).decode()
csp = (f"default-src 'none'; script-src 'sha256-{sha}' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' "
       "https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'none'; "
       "base-uri 'none'; form-action 'none'; object-src 'none'")
if html.count("<title>") != 1: raise RuntimeError("dashboard: no <title> to put the CSP after")
html = html.replace("<title>", f'<meta http-equiv="Content-Security-Policy" content="{csp}">\n<title>', 1)
open(f"{OUT}/index.html", "w", encoding="utf-8").write(html)   # UTF-8 bytes: what the CSP hash was taken over
# The share page (share.html → OUT/s/index.html): a station's prices and advice for a friend without the app, from the
# app's Share link (…/s/?id=<code>&f=<fuel>). Static, built with textContent only, and pinned by a hash CSP: its one
# inline script and one style block, fetch() to this site only. Fails soft: no page and a warning.
shutil.rmtree(f"{OUT}/s", ignore_errors=True)
try:
    page = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "share.html"), encoding="utf-8").read()
    scripts = re.findall(r"<script>(.*?)</script>", page, re.S)
    styles = re.findall(r"<style>(.*?)</style>", page, re.S)
    if len(scripts) != 1 or len(re.findall(r"<script\b", page)) != 1 or len(styles) != 1 or len(re.findall(r"<style\b", page)) != 1:
        raise RuntimeError("expected exactly one inline <script> and one <style>")
    if re.search(r"\son\w+\s*=|\sstyle\s*=", page): raise RuntimeError("inline handler or style attribute (blocked by the CSP)")
    h = lambda t: base64.b64encode(hashlib.sha256(t.encode()).digest()).decode()
    share_csp = (f"default-src 'none'; script-src 'sha256-{h(scripts[0])}'; style-src 'sha256-{h(styles[0])}'; "
                 "connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'")
    # First thing in <head>, so the policy covers every block after it whatever the page's order
    if page.count("<head>") != 1: raise RuntimeError("no <head> to put the CSP in")
    page = page.replace("<head>", f'<head>\n<meta http-equiv="Content-Security-Policy" content="{share_csp}">', 1)
    os.makedirs(f"{OUT}/s"); open(f"{OUT}/s/index.html", "w", encoding="utf-8").write(page)
except Exception as e:
    # A GitHub annotation too: every shared link 404s until this is fixed, and the run itself still passes
    print(f"::warning::share page not published: {type(e).__name__}: {e}")
    print(f"export_api: WARNING share page not published: {type(e).__name__}: {e}")

try:
    if new_calls: track_api.append(BASE, new_calls)   # everything is written: today's calls are now on record
except Exception as e:
    print(f"export_api: WARNING couldn't save today's calls: {type(e).__name__}: {e}")
print(f"export_api: {ctx['asof']}, {len(data['stations'])} stations, " + ", ".join(f"{k} {v // 1024}KB" for k, v in files.items() if k != "station/count")
      + (f"; station files {len(sizes)}, p50 {sizes[len(sizes) // 2] // 1024}KB, max {sizes[-1] // 1024}KB" if sizes else "; NO station files")
      + (f"; WARNINGS: {warnings}" if warnings else ""))
