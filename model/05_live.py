"""Live forecast from today's FuelCheck snapshot + latest AIP TGP."""
import json, pickle, re
import numpy as np, pandas as pd

exec(open("/home/claude/fuel/03_model.py").read().split("def build_features")[0])  # imports, SERIES, H, TGP, TGP_L
M = pickle.load(open("models_v2.pkl", "rb"))
NOW = pd.Timestamp("2026-10-13 11:00")
TODAY = NOW.normalize()

j = json.load(open("/mnt/user-data/uploads/Downloads/nswfuel_snapshot_20261013.json"))
st = pd.DataFrame(j["stations"]); pr = pd.DataFrame(j["prices"])
st["postcode"] = st.address.str.extract(r"NSW\s+(\d{4})\s*$").astype(float)
st["suburb"] = st.address.str.extract(r",\s*([^,]+?)\s+NSW\s+\d{4}\s*$")[0].str.upper()


def region(pc):
    if pd.isna(pc):
        return "Regional NSW"
    pc = int(pc)
    if 2000 <= pc <= 2234 or 2555 <= pc <= 2574 or 2740 <= pc <= 2786: return "Sydney"
    if 2250 <= pc <= 2263: return "Central Coast"
    if 2264 <= pc <= 2327: return "Newcastle & Hunter"
    if 2500 <= pc <= 2533: return "Illawarra"
    return "Regional NSW"


st["region"] = st.postcode.map(region)
pr["ts"] = pd.to_datetime(pr.lastupdated, dayfirst=True)
pr = pr.merge(st[["code", "name", "brand", "region", "postcode", "suburb", "location"]], left_on="stationcode",
              right_on="code")
pr = pr[pr.fueltype.isin(["U91", "E10", "P98", "DL"]) & pr.price.between(80, 600)]
pr["age"] = (TODAY - pr.ts.dt.normalize()).dt.days
pr.to_parquet("snapshot_prices.parquet")


def agg(df):
    a = df.price.values; rec = df[df.age <= 2]; old = df[df.age > 7]
    return dict(n=len(a), median=np.median(a), p10=np.percentile(a, 10), p25=np.percentile(a, 25),
                p75=np.percentile(a, 75), p90=np.percentile(a, 90), share_upd_1d=(df.age <= 1).mean(),
                share_upd_3d=(df.age <= 3).mean(), share_upd_7d=(df.age <= 7).mean(),
                recent_minus_old=(rec.price.median() - old.price.median()) if len(rec) > 5 and len(old) > 5 else np.nan)


cur = {}
for f, g in pr.groupby("fueltype"):
    cur[("NSW", f)] = agg(g)
    for r, gr in g.groupby("region"):
        cur[(r, f)] = agg(gr)

tgu, tgd = TGP_L.loc[:TODAY, "tgp_ulp"], TGP_L.loc[:TODAY, "tgp_dl"]
rows = []
for r, f in SERIES:
    c = cur[(r, f)]
    tg = tgd if f == "DL" else tgu
    x = dict(margin=c["median"] - tg.iloc[-1], p10_margin=c["p10"] - tg.iloc[-1],
             lo_spread=c["median"] - c["p10"], hi_spread=c["p90"] - c["median"], iqr=c["p75"] - c["p25"],
             upd1=c["share_upd_1d"], upd3=c["share_upd_3d"], upd7=c["share_upd_7d"],
             recent_minus_old=c["recent_minus_old"],
             gap_vs_regional_u91=c["median"] - cur[("Regional NSW", "U91")]["median"],
             gap_vs_nsw_u91=c["median"] - cur[("NSW", "U91")]["median"], dow=TODAY.dayofweek,
             is_syd=int(r == "Sydney"), fuel_id=["U91", "E10", "P98", "DL"].index(f))
    for k in [1, 3, 7, 14, 28]:
        x[f"tgp_chg{k}"] = tg.iloc[-1] - tg.iloc[-1 - k]
    X = pd.DataFrame([x])[M["FA"]]
    out = dict(region=r, fuel=f, now=round(c["median"], 1), p10=round(c["p10"], 1), p90=round(c["p90"], 1),
               tgp=round(tg.iloc[-1], 1), margin=round(x["margin"], 1),
               p_jump7=round(float(M["clf"].predict_proba(X)[0, 1]), 2))
    for h in H:
        mdl, q = M["final"][h]
        d = float(mdl.predict(X)[0])
        out[f"d{h}"] = round(d, 1); out[f"lo{h}"] = round(d - q, 1); out[f"hi{h}"] = round(d + q, 1)
    rows.append(out)
L = pd.DataFrame(rows)
L.to_csv("live_forecast.csv", index=False)
pd.set_option("display.width", 250)
print(L.to_string())
print("TGP last", TGP.dropna().index.max(), tgu.iloc[-1], tgd.iloc[-1])
