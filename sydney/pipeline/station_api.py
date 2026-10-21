"""Per-station API: api/v1/station/{id}.json for the app's station ("ticker") page and home-screen widget.

Called from export_api.py with the globals of its build.py run (build.py itself is not changed). One file per station in
stations.json, keyed by the NSW FuelCheck station code, shaped like `StationDetail` in app/src/lib/types.ts:

hist  End-of-day price per fuel for the last 400 days to `asof` (null = unknown / not sold).
      1. NSW monthly price-change history (store/events/syd_events_*.csv; older files carry `sid`, mapped to an address key
         via syd_stations.csv). Keys are normalised the way station_profile.py does, and a station is joined to them
         through its address key in stations_today.json.
      2. For days after the last monthly history: the daily snapshots in archive/nsw_snapshot_*.json.gz (keyed by station
         `code`). Each price becomes a change event at its `lastupdated` time (when that falls after the history), and is
         also an observation on the snapshot day itself (a snapshot only shows the price at fetch time, so a station that
         changed price twice between snapshots shows only the later change).
      3. Today's price from stations_today.json.
      The last price of each day is carried forward: up to 180 days while the station-fuel is seen again later (the events
      are changes, so a quiet spell is a steady price), and up to 30 days after its last change or observation (so a
      closed station or a dropped fuel goes null). Beyond that, null.
profile  The station's entry in store/station_profile.json (typ, lag, part, n), or null.
fc    Per fuel the station sells today: the Sydney forecast for that fuel turned into a forecast for this station.
      - Path: build.py's market() interpolates the Sydney expected change d1/d3/d7/d14 (and lo/hi) to a daily path d(h),
        h = 0..14 days.
      - Lag: the station's shift s (days) is the same rule as advise(): round((lag - Sydney median lag) / 24h), clipped to
        -1..+2 (0 without a lag). The station's path at day h is the Sydney path at day h - s (clamped to 0..14), so a slow
        follower rises later and a quick one earlier.
      - Participation: the change is scaled by w = part / (median part of Sydney stations), capped at 1; with no reliable
        profile (n < 5) w = 1. A steady pricer (part < 0.25, e.g. Costco) gets w of about 0.1-0.3, so its path is nearly flat.
      - Range: lo/hi are the Sydney lo/hi offsets around the path at the same shifted day, scaled by sqrt(w) (a steady
        pricer is less uncertain, but not proportionally so).
      - Anchor: `now` is the station's price in stations.json; d*/lo*/hi* are changes vs `now` in c/L, rounded to 0.1.
      - adv: the station's advice from stations.json, unchanged. rise: the Sydney rise day J from market() shifted by s
        (at least tomorrow), as an ISO date; null when there is no J, J + s is beyond 14 days, or the station is a steady
        pricer (n >= 5 and part < 0.25, the same test advise() uses).
"""
import datetime as dt, glob, gzip, json, os, re
import numpy as np, pandas as pd

FUELS = ["U91", "E10", "P98", "DL"]
DAYS = 400          # days of history per file, ending at asof
FFILL = 30          # max days the last known price is carried forward after a station-fuel's last change/observation
FFILL_GAP = 180     # max days carried forward between two known prices (events are changes, so no event = same price)
HZ = [1, 3, 7, 14]
norm = lambda s: re.sub(r"\s+", " ", str(s).upper().replace(",", " ")).strip()   # same as station_profile.py
r1 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1) + 0.0   # + 0.0: no "-0.0"


def _history_events(ev_dir, since, keys):
    """Price-change events (key, fuel, ts, price) from the monthly NSW history, from `since` on, for the given keys."""
    st = pd.read_csv(f"{ev_dir}/syd_stations.csv", dtype=str)
    sid2key = dict(zip(st.sid.astype(int), st.key.map(norm)))
    parts = []
    for f in sorted(glob.glob(f"{ev_dir}/syd_events_*.csv")):
        m = re.search(r"_(\d{4})(\d{2})?\.csv$", f)
        if not m: continue
        y, mo = int(m.group(1)), int(m.group(2) or 12)
        if (y, mo) < (since.year, since.month): continue
        e = pd.read_csv(f, dtype={"hhmm": str})
        e["key"] = e.sid.astype(int).map(sid2key) if "sid" in e.columns else e.key.map(norm)
        e = e[e.fuel.isin(FUELS) & e.key.isin(keys) & e.price.between(50, 600) & (e.ymd >= int(since.strftime("%Y%m%d")))]
        parts.append(e[["key", "fuel", "ymd", "hhmm", "price"]])
    if not parts: return pd.DataFrame(columns=["key", "fuel", "ts", "price"]), None
    ev = pd.concat(parts, ignore_index=True)
    ev["ts"] = pd.to_datetime(ev.ymd.astype(str) + ev.hhmm.str.zfill(4), format="%Y%m%d%H%M")
    ev = ev.drop_duplicates(["key", "fuel", "ts", "price"])
    return ev[["key", "fuel", "ts", "price"]], (ev.ts.max().normalize() if len(ev) else None)


def _snapshot_events(arch_dir, after, asof, codes):
    """Events (code, fuel, ts, price) and addresses from archive snapshots dated after `after` up to `asof`."""
    rows, addr = [], {}
    snaps = sorted((pd.Timestamp(m.group(1)), f) for f in glob.glob(f"{arch_dir}/nsw_snapshot_*.json.gz")
                   if (m := re.search(r"(\d{8})", os.path.basename(f))))
    snaps = [(day, f) for day, f in snaps if day <= asof]
    for i, (day, f) in enumerate(snaps):
        if after is not None and day <= after and i < len(snaps) - 1: continue   # covered by history; newest kept for addresses
        j = json.load(gzip.open(f, "rt"))
        for s in j.get("stations", []):
            if str(s.get("code")) in codes and s.get("address"): addr[str(s["code"])] = s["address"]
        if after is not None and day <= after: continue
        p = pd.DataFrame(j.get("prices", []))
        if p.empty: continue
        p["code"] = p.stationcode.astype(str)
        p = p[p.code.isin(codes) & p.fueltype.isin(FUELS) & p.price.between(50, 600)].copy()
        p["ts"] = pd.to_datetime(p.lastupdated, dayfirst=True, errors="coerce")
        fetched = min(p.ts.max(), day + pd.Timedelta(hours=23, minutes=59)) if p.ts.notna().any() else day
        fetched = max(fetched, day)
        chg = p[p.ts.notna() & (p.ts <= fetched)]
        if after is not None: chg = chg[chg.ts.dt.normalize() > after]
        obs = p.assign(ts=fetched)                         # the price as seen when the snapshot was taken
        rows += [chg[["code", "fueltype", "ts", "price"]], obs[["code", "fueltype", "ts", "price"]]]
    ev = pd.concat(rows, ignore_index=True).rename(columns={"fueltype": "fuel"}) if rows else pd.DataFrame(columns=["code", "fuel", "ts", "price"])
    return ev, addr


def station_ids(G):
    """NSW station codes in the same order and with the same filter as build.py's `sta` loop, so
    data["stations"][i] is ids[i]; plus each code's normalised address key. Raises if the two don't line up."""
    ids, keyof = [], {}
    for code, g in G["S"].groupby("code"):
        r0 = g.iloc[0]
        if pd.isna(r0.get("lat")) or pd.isna(r0.get("lon")): continue
        ids.append(str(code)); keyof[str(code)] = norm(r0.get("key")) if isinstance(r0.get("key"), str) else None
    st = G["data"]["stations"]
    if len(ids) != len(st) or len(set(ids)) != len(ids):
        raise ValueError(f"station ids {len(ids)} ({len(set(ids))} unique) != stations {len(st)}")
    return ids, keyof


def build(base, G, schema):
    """G = globals of the build.py run (data, S, MK, PF, asof). Returns {id: StationDetail} in stations order."""
    data, S, MK, PF = G["data"], G["S"], G["MK"], G["PF"]
    fc_asof = G["asof"]                                    # forecast date (what advise() counts days from)
    asof = pd.Timestamp(data["snap_asof"])                 # stations' date: hist ends here
    start = asof - pd.Timedelta(days=DAYS - 1)
    warm = start - pd.Timedelta(days=FFILL_GAP + 1)

    ids, keyof = station_ids(G)

    # ---- history in station-code space
    codes = set(ids)
    k2c = {}
    for c, k in keyof.items():
        if k: k2c.setdefault(k, []).append(c)
    hev, hist_end = _history_events(f"{base}/store/events", warm, set(k2c))
    hev = hev.assign(code=hev.key.map(k2c)).explode("code")[["code", "fuel", "ts", "price"]]
    sev, addr = _snapshot_events(f"{base}/archive", hist_end, asof, codes)
    today = S[S.code.astype(str).isin(codes) & S.fueltype.isin(FUELS)]
    tev = pd.DataFrame({"code": today.code.astype(str), "fuel": today.fueltype, "ts": asof + pd.Timedelta(hours=23, minutes=59, seconds=59),
                        "price": today.price.astype(float)})
    ev = pd.concat([hev, sev, tev], ignore_index=True)
    ev = ev[(ev.ts >= warm) & (ev.ts <= asof + pd.Timedelta(days=1))].sort_values("ts", kind="stable")
    ev["date"] = ev.ts.dt.normalize()
    eod = ev.groupby(["fuel", "date", "code"]).price.last()
    days = pd.date_range(warm, asof)
    H = {}
    for f in FUELS:
        if f not in eod.index.get_level_values(0): continue
        M = eod.loc[f].unstack().reindex(days)
        later = M.notna().iloc[::-1].cummax().iloc[::-1]          # True where this station-fuel is seen again on/after the day
        M = M.ffill(limit=FFILL_GAP).where(later, M.ffill(limit=FFILL)).loc[start:]
        H[f] = M

    # ---- forecast helpers
    LIVE = {r["fuel"]: r for r in data["live"]}
    lag_med = PF.get("lag_median", 48)
    parts = [p["part"] for p in PF.get("stations", {}).values() if p.get("part") is not None and p.get("n", 0) >= 5]
    part_med = float(np.median(parts)) if parts else 1.0
    hs = np.arange(15)
    band = {}
    for f, r in LIVE.items():
        lo = np.interp(hs, [0, 1, 3, 7, 14], [0, r["lo1"], r["lo3"], r["lo7"], r["lo14"]])
        hi = np.interp(hs, [0, 1, 3, 7, 14], [0, r["hi1"], r["hi3"], r["hi7"], r["hi14"]])
        band[f] = (lo, hi)

    out = {}
    for sid, s in zip(ids, data["stations"]):
        key = keyof.get(sid)
        prof = PF.get("stations", {}).get(key) if key else None
        p = prof or {}
        lag = p.get("lag")
        shift = 0 if lag is None else int(np.clip(round((lag - lag_med) / 24), -1, 2))
        steady = p.get("n", 0) >= 5 and p.get("part", 1) < 0.25
        w = 1.0 if p.get("n", 0) < 5 or p.get("part") is None else float(np.clip(p["part"] / part_med, 0, 1))
        idx = np.clip(hs - shift, 0, 14)
        fc = {}
        for f, pr in s["p"].items():
            if f not in MK: continue
            _, d, J = MK[f]; lo, hi = band[f]
            ds = w * d[idx]; los = ds + np.sqrt(w) * (lo[idx] - d[idx]); his = ds + np.sqrt(w) * (hi[idx] - d[idx])
            row = {"now": pr[0]}
            for h in HZ:
                a, b, c = r1(ds[h]), r1(los[h]), r1(his[h])
                row.update({f"d{h}": a, f"lo{h}": min(a, b), f"hi{h}": max(a, c)})
            k = None if J is None or steady else max(J + shift, 1)
            row["rise"] = None if k is None or k > 14 else str((fc_asof + pd.Timedelta(days=k)).date())
            row["adv"] = [pr[2], pr[3], pr[4]]
            fc[f] = row
        hist = {}
        for f, M in H.items():
            if sid in M.columns and M[sid].notna().any():
                hist[f] = [r1(v) for v in M[sid].values]
        out[sid] = {"schema": schema, "asof": str(asof.date()), "id": sid,
                    "n": s["n"], "b": s["b"], "s": s["s"], "pc": s["pc"], "la": s["la"], "lo": s["lo"], "m": s["m"],
                    "addr": addr.get(sid), "start": str(start.date()), "hist": hist,
                    "profile": None if prof is None else {"typ": prof.get("typ", {}), "lag": prof.get("lag"), "part": prof.get("part"), "n": prof.get("n", 0)},
                    "fc": fc}
    return out


def check(details, stations):
    """Sanity checks: every station has a file, fc.now is its stations.json price, no NaN, hist length right."""
    errs = []
    for s in stations:
        d = details.get(s["id"])
        if d is None: errs.append(f"station {s['id']}: no file"); continue
        for f, pr in s["p"].items():
            fc = d["fc"].get(f)
            if fc is None or fc["now"] != pr[0]: errs.append(f"station {s['id']} {f}: fc.now {fc and fc['now']} != {pr[0]}")
            elif list(fc["adv"]) != list(pr[2:5]): errs.append(f"station {s['id']} {f}: adv differs")
            elif any(not isinstance(fc[k], (int, float)) or fc[k] != fc[k] for k in fc if k[0] in "dlh"):
                errs.append(f"station {s['id']} {f}: non-numeric forecast")
            h = d["hist"].get(f)
            if h is None or len(h) != DAYS or h[-1] != pr[0]: errs.append(f"station {s['id']} {f}: hist ends {h and h[-1]} != {pr[0]}")
        if len(errs) > 20: break
    return errs
