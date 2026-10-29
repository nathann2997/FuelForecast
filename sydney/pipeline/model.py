"""Sydney pump price model: features, walk-forward backtest, final fit and live forecast.

usage: python model.py BASE [--backtest]
Reads store/daily.csv, store/tgp.csv, store/fred.csv; writes store/forecast.json (+ store/backtest.json with --backtest).
"""
import json, os, sys, warnings
import numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import roc_auc_score

warnings.filterwarnings("ignore")
BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = f"{BASE}/store"; DO_BT = "--backtest" in sys.argv
from fuels import FUELS
H = [1, 3, 7, 14]
PARAMS = dict(n_estimators=400, learning_rate=0.03, num_leaves=15, min_child_samples=40, subsample=0.8,
              subsample_freq=1, colsample_bytree=0.8, reg_lambda=2.0, verbose=-1)

D = pd.read_csv(f"{STORE}/daily.csv", parse_dates=["date"])
T = pd.read_csv(f"{STORE}/tgp.csv", parse_dates=["date"]).set_index("date")
Fr = pd.read_csv(f"{STORE}/fred.csv", parse_dates=["date"]).set_index("date")
asof = D.date.max()
cal = pd.date_range("2018-06-01", asof + pd.Timedelta(days=20))
TL = T.reindex(cal).ffill().shift(1)                    # wholesale known with a 1-day lag
FrL = Fr.reindex(cal).ffill().shift(1)
FrL["brent_aud"] = FrL.DCOILBRENTEU / FrL.DEXUSAL         # Brent in AUD per barrel
# Diesel crack: EIA NY Harbor ULSD (USD/gal) against Brent, same 1-day lag; blank if missing or over 10 days stale.
# Diesel rows only: it helped diesel and hurt petrol in the walk-forward test (2026-10, diesel 7-day jump AUC 0.84 -> 0.90)
ULSD = (Fr.ULSD_NYH.reindex(cal).ffill(limit=10).shift(1) * 42) if "ULSD_NYH" in Fr else pd.Series(np.nan, index=cal)
CRACK = ["prod_pct7", "prod_pct14", "prod_pct28", "crack", "crack_chg14", "crack_chg28", "crack_vs90"]


def vol_ratio(col):
    """Wholesale volatility now vs normal: 28-day mean |daily TGP change| over its trailing-year mean, capped 0.75-3.
    Scales the forecast ranges, which otherwise under-cover in shock months (walk-forward 2021-26: 7-day 0.69, 14-day 0.61)."""
    a = TL[col].diff().abs()
    return (a.rolling(28, 20).mean() / a.rolling(365, 200).mean()).clip(0.75, 3).fillna(1.0)
VOL = {f: vol_ratio("tgp_dl" if f == "DL" else "tgp_ulp") for f in FUELS}
# Live: read the ratio on the day after the last real TGP (TL is lagged a day). TGP arrives in weekly batches, and the
# filled-forward days would count as zero change and narrow the ranges just when a jump starts
VOL_DAY = {f: min(asof, T["tgp_dl" if f == "DL" else "tgp_ulp"].dropna().index.max() + pd.Timedelta(days=1)) for f in FUELS}


def features(D):
    out = []
    u91 = D[D.fuel == "U91"].set_index("date")["median"].reindex(cal)
    # restoration days: Sydney U91 median up >= 8c within 3 days (spaced >= 10 days)
    rise = (u91 - u91.shift(3)) >= 8
    last_r, dsr = None, pd.Series(np.nan, index=cal)
    for d in cal:
        if rise.get(d, False) and (last_r is None or (d - last_r).days >= 10):
            last_r = d
        if last_r is not None:
            dsr[d] = (d - last_r).days
    obs = u91.notna().rolling(14, min_periods=1).sum()
    dsr[obs < 10] = np.nan                              # unknown cycle phase when history has gaps
    for i, f in enumerate(FUELS):
        g = D[D.fuel == f].set_index("date").reindex(cal)
        tg = TL["tgp_dl" if f == "DL" else "tgp_ulp"]
        x = pd.DataFrame(index=cal)
        x["fuel"], x["fuel_id"], x["median"] = f, i, g["median"]
        x["margin"] = g["median"] - tg
        x["p10_margin"] = g.p10 - tg
        x["lo_spread"], x["hi_spread"], x["iqr"] = g["median"] - g.p10, g.p90 - g["median"], g.p75 - g.p25
        x["upd1"], x["upd3"], x["recent_minus_old"] = g.share_upd_1d, g.share_upd_3d, g.recent_minus_old
        for k in [1, 3, 7, 14, 28]:
            x[f"tgp_chg{k}"] = tg - tg.shift(k)
        for k in [7, 14, 28]:
            x[f"brent_pct{k}"] = 100 * (FrL.brent_aud / FrL.brent_aud.shift(k) - 1)
        x["brent_vs90"] = 100 * (FrL.brent_aud / FrL.brent_aud.rolling(90, 30).mean() - 1)
        x["audusd_chg28"] = 100 * (FrL.DEXUSAL / FrL.DEXUSAL.shift(28) - 1)
        prod_aud, crack = ULSD / FrL.DEXUSAL, ULSD - FrL.DCOILBRENTEU
        for k in [7, 14, 28]:
            x[f"prod_pct{k}"] = 100 * (prod_aud / prod_aud.shift(k) - 1)
        x["crack"], x["crack_chg14"], x["crack_chg28"] = crack, crack - crack.shift(14), crack - crack.shift(28)
        x["crack_vs90"] = crack - crack.rolling(90, 30).mean()
        if f != "DL": x[CRACK] = np.nan
        x["margin_vs_365"] = x.margin - x.margin.rolling(365, 120).median()
        for k in [1, 3, 7, 14]:
            x[f"mom{k}"] = g["median"] - g["median"].shift(k)
        x["off_28max"] = g["median"] - g["median"].rolling(28, 20).max()
        x["off_28min"] = g["median"] - g["median"].rolling(28, 20).min()
        x["days_since_restore"] = dsr
        x["u91_gap"] = g["median"] - u91 if f != "U91" else 0.0
        x["dow"] = cal.dayofweek
        for h in H:
            x[f"y{h}"] = g["median"].shift(-h) - g["median"]
        fut_max = pd.concat([g["median"].shift(-k) for k in range(1, 8)], axis=1).max(axis=1)
        x["y_jump7"] = np.where(x.y7.notna(), (fut_max - g["median"] >= 5).astype(float), np.nan)
        out.append(x[g["median"].notna()].reset_index(names="date"))
    return pd.concat(out, ignore_index=True)


F = features(D)
FA = ["margin", "p10_margin", "lo_spread", "hi_spread", "iqr", "upd1", "upd3", "recent_minus_old",
      "tgp_chg1", "tgp_chg3", "tgp_chg7", "tgp_chg14", "tgp_chg28", "u91_gap", "dow", "fuel_id"]
FC = FA + ["brent_pct7", "brent_pct14", "brent_pct28", "brent_vs90", "audusd_chg28", "margin_vs_365"]
FD = FC + ["mom1", "mom3", "mom7", "mom14", "off_28max", "off_28min", "days_since_restore"]
VARIANTS = {"snapshot+wholesale": FA, "+oil & AUD": FC, "+cycle memory": FD}
PROD = "+cycle memory"
fit = lambda tr, feats, y: lgb.LGBMRegressor(objective="huber", alpha=3.0, **PARAMS).fit(tr[feats], tr[y])
fit_clf = lambda tr, feats: lgb.LGBMClassifier(**PARAMS).fit(tr[feats], tr.y_jump7)


def predict(make, tr, te, feats, proba=False):
    """Petrol rows from a model on `feats`; diesel rows from a second model on `feats` + CRACK, both fit on every fuel.
    Adding CRACK to the shared model helped diesel but cost every petrol fuel (walk-forward 2026-10), so petrol keeps
    exactly the model it had."""
    out = []
    for fs, rows in [(feats, te.fuel != "DL"), (feats + CRACK, te.fuel == "DL")]:
        if not rows.any(): continue
        m = make(tr, fs); x = te.loc[rows, fs]
        out.append(pd.Series(m.predict_proba(x)[:, 1] if proba else m.predict(x), index=x.index))
    return pd.concat(out).reindex(te.index).values

if DO_BT:
    preds, cls = [], []
    for m in pd.period_range("2021-01", (asof - pd.Timedelta(days=15)).strftime("%Y-%m"), freq="M"):
        t0 = m.start_time
        te_all = F[F.date.dt.to_period("M") == m]
        for h in H:
            y = f"y{h}"
            tr = F[(F.date + pd.Timedelta(days=h) < t0) & F[y].notna()]
            te = te_all[te_all[y].notna()]
            if te.empty: continue
            rec = te[["date", "fuel", y]].rename(columns={y: "actual"}).assign(h=h)
            for name, feats in VARIANTS.items():
                rec[name] = (fit(tr, feats, y).predict(te[feats]) if feats is FA   # the baseline variant stays one model
                             else predict(lambda t, fs: fit(t, fs, y), tr, te, feats))
            preds.append(rec)
        tr = F[(F.date + pd.Timedelta(days=7) < t0) & F.y_jump7.notna()]
        te = te_all[te_all.y_jump7.notna()]
        if len(te):
            cls.append(te[["date", "fuel", "y_jump7"]].assign(p=predict(fit_clf, tr, te, FD, proba=True)))
    P = pd.concat(preds, ignore_index=True); C = pd.concat(cls, ignore_index=True)
    P.to_parquet(f"{STORE}/backtest_preds.parquet"); C.to_parquet(f"{STORE}/backtest_cls.parquet")

if os.path.exists(f"{STORE}/backtest_preds.parquet"):
    P = pd.read_parquet(f"{STORE}/backtest_preds.parquet").reset_index(drop=True)
    C = pd.read_parquet(f"{STORE}/backtest_cls.parquet").reset_index(drop=True)
    SHOCK = ["2022-02", "2022-03", "2022-04", "2022-05", "2022-06", "2022-07", "2022-08", "2022-09",
             "2026-03", "2026-04", "2026-07", "2026-08"]
    P["month"] = P.date.dt.to_period("M").astype(str); P["shock"] = P.month.isin(SHOCK)
    summ = {}
    for (h, f), g in P.groupby(["h", "fuel"]):
        r = {"naive": float(np.abs(g.actual).mean())}
        for v in VARIANTS: r[v] = float(np.abs(g.actual - g[v]).mean())
        mv = g.actual.abs() >= 1
        r["dir"] = float((np.sign(g[PROD][mv]) == np.sign(g.actual[mv])).mean())
        for s, gg in g.groupby("shock"):
            r["naive_" + ("shock" if s else "calm")] = float(np.abs(gg.actual).mean())
            r["model_" + ("shock" if s else "calm")] = float(np.abs(gg.actual - gg[PROD]).mean())
        summ[f"{f}|{h}"] = r
    u7 = P[(P.h == 7) & (P.fuel == "U91")]
    yearly = u7.groupby(u7.date.dt.year).apply(
        lambda g: {"naive": float(np.abs(g.actual).mean()), "model": float(np.abs(g.actual - g[PROD]).mean())}).to_dict()
    recent = P[P.date >= P.date.max() - pd.Timedelta(days=365)]
    resid = {h: float(np.quantile(np.abs(g.actual - g[PROD]), 0.8)) for h, g in recent.groupby("h")}
    # 80% ranges per variant, fuel and horizon on volatility-scaled errors; the live range multiplies back by today's VOL
    v = np.array([VOL[f].get(d, 1.0) for f, d in zip(recent.fuel, recent.date)])
    q80n = {var: {f: {str(h): float(np.quantile(np.abs(g.actual - g[var]) / v[g.index], 0.8)) for h, g in gf.groupby("h")}
                  for f, gf in recent.reset_index(drop=True).groupby("fuel")} for var in ["+oil & AUD", PROD]}
    auc = {f: float(roc_auc_score(g.y_jump7, g.p)) for f, g in C.groupby("fuel") if g.y_jump7.nunique() > 1}
    bt7 = P[(P.h == 7) & (P.fuel == "U91")].sort_values("date")
    bt7 = bt7[bt7.date >= bt7.date.max() - pd.Timedelta(days=730)]
    json.dump({"summary": summ, "yearly_u91_h7": {str(k): v for k, v in yearly.items()}, "q80": resid, "q80n": q80n, "auc": auc,
               "test_from": "2021-01", "test_to": str(P.date.max().date()), "variants": list(VARIANTS), "prod": PROD,
               "bt7": {"dates": [str(d.date()) for d in bt7.date], "actual": bt7.actual.round(1).tolist(),
                       "pred": bt7[PROD].round(1).tolist()}},
              open(f"{STORE}/backtest.json", "w"))
    print("BACKTEST U91 MAE by h:", {h: {k: round(v, 2) for k, v in summ[f"U91|{h}"].items()} for h in H})

# ---- final fit + live forecast for the latest day in the store
bt = json.load(open(f"{STORE}/backtest.json"))
q80 = {int(k): v for k, v in bt["q80"].items()}
live = []
X = F[F.date == asof]
imp = None
for f in FUELS:
    row = X[X.fuel == f]
    if row.empty: continue
    out = {"fuel": f, "now": round(float(row["median"].iloc[0]), 1),
           "p10": round(float(D[(D.date == asof) & (D.fuel == f)].p10.iloc[0]), 1),
           "p90": round(float(D[(D.date == asof) & (D.fuel == f)].p90.iloc[0]), 1),
           "tgp": round(float((TL["tgp_dl" if f == "DL" else "tgp_ulp"]).loc[asof]), 1),
           "margin": round(float(row.margin.iloc[0]), 1)}
    live.append(out)
MEM = ["mom1", "mom3", "mom7", "mom14", "off_28max", "off_28min", "days_since_restore"]
LIVE_FEATS = FD if X[MEM].notna().all().all() else FC   # memory features need ~4 weeks of unbroken daily data
QN = bt.get("q80n", {}).get(PROD if LIVE_FEATS is FD else "+oil & AUD", {})   # ranges from the live model's own errors
def half_width(f, h):
    q = QN.get(f, {}).get(str(h))
    return q80[h] if q is None else q * float(VOL[f].loc[VOL_DAY[f]])
for h in H:
    tr = F[F[f"y{h}"].notna()]
    mdl = fit(tr, LIVE_FEATS, f"y{h}")
    if h == 7:
        g = pd.Series(mdl.booster_.feature_importance("gain"), index=LIVE_FEATS); imp = (g / g.sum()).sort_values(ascending=False).round(3).head(8).to_dict()
    pred = dict(zip(X.fuel, predict(lambda t, fs: mdl if fs is LIVE_FEATS else fit(t, fs, f"y{h}"), tr, X, LIVE_FEATS)))
    for o in live:
        d = float(pred[o["fuel"]])
        w = half_width(o["fuel"], h)
        o[f"d{h}"] = round(d, 1); o[f"lo{h}"] = round(d - w, 1); o[f"hi{h}"] = round(d + w, 1)
trc = F[F.y_jump7.notna()]
clf = fit_clf(trc, LIVE_FEATS)
pj = dict(zip(X.fuel, predict(lambda t, fs: clf if fs is LIVE_FEATS else fit_clf(t, fs), trc, X, LIVE_FEATS, proba=True)))
for o in live:
    o["p_jump7"] = round(float(pj[o["fuel"]]), 2)
ctx = {"asof": str(asof.date()), "tgp_last": str(T.dropna().index.max().date()), "fred_last": str(Fr[["DCOILBRENTEU", "DEXUSAL"]].dropna().index.max().date()),
       "brent_aud": round(float(FrL.brent_aud.loc[asof]), 1), "brent_usd": round(float(FrL.DCOILBRENTEU.loc[asof]), 1),
       "audusd": round(float(FrL.DEXUSAL.loc[asof]), 4), "importance_h7": imp,
       "history_last": str(D[D.source == "history"].date.max().date()),
       "live_model": "full (with cycle memory)" if LIVE_FEATS is FD else "no cycle memory (daily history has a gap)",
       "snapshot_days": int(D[D.source == "snapshot"].date.nunique()),
       "range_vol": {f: round(float(VOL[f].loc[VOL_DAY[f]]), 2) for f in FUELS}}   # wholesale volatility ratio behind lo/hi
json.dump({"live": live, "ctx": ctx}, open(f"{STORE}/forecast.json", "w"))
print(json.dumps(live, indent=0)[:1500]); print(ctx)
