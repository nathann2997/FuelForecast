"""Daily: fold the latest raw pulls in inbox/ into the store.

inbox/ may contain (any subset; newest of each is used):
  nsw_snapshot_*.json   raw response of GET /FuelPriceCheck/v1/fuel/prices
  AIP_TGP_Data_*.xlsx   AIP historical TGP workbook
  fredgraph.csv         FRED CSV for ids DCOILBRENTEU,DEXUSAL (older '#'-block format also accepted)
Writes store/daily.csv (adds/replaces snapshot rows), store/tgp.csv, store/fred.csv, store/stations_today.json
"""
import glob, io, json, os, re, sys
import numpy as np, pandas as pd

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = sys.argv[2] if len(sys.argv) > 2 else f"{BASE}/inbox"
STORE = f"{BASE}/store"
FUELS = ["U91", "E10", "P98", "DL"]
is_syd = lambda pc: (2000 <= pc <= 2234) or (2555 <= pc <= 2574) or (2740 <= pc <= 2786)
newest = lambda pat: (sorted(glob.glob(f"{INBOX}/{pat}"), key=os.path.getmtime) or [None])[-1]
log = []

# ---- NSW live snapshot -> one daily row per fuel (same definitions as build_history.py)
snap = newest("nsw_snapshot_*.json")
if snap:
    j = json.load(open(snap))
    st = pd.DataFrame(j["stations"]); pr = pd.DataFrame(j["prices"])
    st["postcode"] = pd.to_numeric(st.address.str.extract(r"NSW\s+(\d{4})\s*$")[0], errors="coerce")
    st["suburb"] = st.address.str.extract(r",\s*([^,]+?)\s+NSW\s+\d{4}\s*$")[0].str.title()
    st = st[st.postcode.fillna(0).astype(int).map(is_syd)]
    pr["code"] = pr.stationcode.astype(str); st["code"] = st.code.astype(str)
    pr = pr.merge(st[["code", "name", "brand", "postcode", "suburb", "location"]], on="code")
    pr = pr[pr.fueltype.isin(FUELS) & pr.price.between(50, 600)].copy()
    pr["ts"] = pd.to_datetime(pr.lastupdated, dayfirst=True, errors="coerce")
    asof = pd.Timestamp(re.search(r"(\d{8})", os.path.basename(snap)).group(1)) if re.search(r"(\d{8})", os.path.basename(snap)) else pr.ts.max().normalize()
    pr["age"] = (asof - pr.ts.dt.normalize()).dt.days
    rows = []
    for f, g in pr.groupby("fueltype"):
        a = g.price.values; rec, old = g[g.age <= 2].price, g[g.age > 7].price
        rows.append(dict(date=asof.date(), fuel=f, n=len(a), median=np.median(a), mean=a.mean(),
                         p10=np.percentile(a, 10), p25=np.percentile(a, 25), p75=np.percentile(a, 75),
                         p90=np.percentile(a, 90), hikes=np.nan, cuts=np.nan,
                         share_upd_1d=(g.age <= 1).mean(), share_upd_3d=(g.age <= 3).mean(), share_upd_7d=(g.age <= 7).mean(),
                         recent_minus_old=(rec.median() - old.median()) if len(rec) > 5 and len(old) > 5 else np.nan,
                         source="snapshot"))
    D = pd.read_csv(f"{STORE}/daily.csv", parse_dates=["date"])
    new = pd.DataFrame(rows).round(3); new["date"] = pd.to_datetime(new.date)
    D = pd.concat([D[~((D.date == asof) & (D.source == "snapshot"))], new]).sort_values(["date", "fuel"])
    D = D.drop_duplicates(["date", "fuel"], keep="first")  # history rows win over a snapshot for the same day
    D.to_csv(f"{STORE}/daily.csv", index=False)
    pr["lat"] = pr.location.map(lambda l: (l or {}).get("latitude")); pr["lon"] = pr.location.map(lambda l: (l or {}).get("longitude"))
    keep = pr[["code", "name", "brand", "postcode", "suburb", "lat", "lon", "fueltype", "price", "age"]]
    json.dump({"asof": str(asof.date()), "rows": keep.to_dict(orient="records")}, open(f"{STORE}/stations_today.json", "w"))
    # station-level archive: today's Sydney stations and prices, gzipped (kept in the repo)
    import gzip
    os.makedirs(f"{BASE}/archive", exist_ok=True)
    codes = set(st.code.astype(str))
    with gzip.open(f"{BASE}/archive/nsw_snapshot_{asof:%Y%m%d}.json.gz", "wt") as fh:
        json.dump({"stations": [s for s in j["stations"] if str(s["code"]) in codes],
                   "prices": [p for p in j["prices"] if str(p["stationcode"]) in codes]}, fh)
    log.append(f"snapshot {asof.date()}: {len(pr)} Sydney prices")

# ---- AIP TGP
x = newest("AIP_TGP_Data_*.xlsx")
if x:
    out = {}
    for sheet, col in [("Petrol TGP", "tgp_ulp"), ("Diesel TGP", "tgp_dl")]:
        s = pd.read_excel(x, sheet_name=sheet, header=0)
        s = s.iloc[:, :2]; s.columns = ["date", col]
        s["date"] = pd.to_datetime(s.date, errors="coerce"); out[col] = s.dropna().set_index("date")[col]
    T = pd.concat(out, axis=1).sort_index()
    T.to_csv(f"{STORE}/tgp.csv", index_label="date")
    log.append(f"tgp to {T.index.max().date()}")

# ---- FRED Brent (USD/bbl) and AUD/USD
fr = newest("fredgraph*.csv") or newest("fred_brent_aud*.csv")
if fr:
    txt = open(fr).read()
    if txt.startswith("#"):
        blocks = {}
        for part in txt.split("#")[1:]:
            name, body = part.split("\n", 1)
            b = pd.read_csv(io.StringIO(body), na_values=["."]); b.columns = ["date", name.strip()]
            blocks[name.strip()] = b.assign(date=pd.to_datetime(b.date)).set_index("date")[name.strip()]
        Fr = pd.concat(blocks, axis=1).sort_index()
    else:   # fredgraph.csv?id=DCOILBRENTEU,DEXUSAL
        Fr = pd.read_csv(io.StringIO(txt), na_values=["."]).rename(columns={"observation_date": "date", "DATE": "date"})
        Fr["date"] = pd.to_datetime(Fr.date); Fr = Fr.set_index("date")[["DCOILBRENTEU", "DEXUSAL"]].sort_index()
        Fr = Fr[Fr.index >= "2018-06-01"]
    if os.path.exists(f"{STORE}/fred.csv"):
        old = pd.read_csv(f"{STORE}/fred.csv", parse_dates=["date"]).set_index("date")
        Fr = Fr.combine_first(old)
    Fr.to_csv(f"{STORE}/fred.csv", index_label="date")
    log.append(f"fred to {Fr.dropna().index.max().date()}")

print("; ".join(log) or "nothing in inbox")
