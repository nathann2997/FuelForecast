"""v2: wholesale-aware forecasting with honest benchmarks, calibrated intervals and a live forecast.

Model A  (live): features from ONE live FuelCheck snapshot + AIP wholesale (TGP) history.
Model B  (research): Model A + retail momentum (needs a stored daily history of the API).
Benchmarks: naive (no change) and a wholesale pass-through rule (ridge on TGP changes + margin).
Validation: expanding-window walk-forward, test months Jan-Aug 2026.
Intervals: split-conformal (80%) from the last 45 days of each training window.
"""
import json, pickle, warnings
import numpy as np, pandas as pd, lightgbm as lgb
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, roc_auc_score, brier_score_loss

warnings.filterwarnings("ignore")
exec(open("/home/claude/fuel/03_model.py").read().split("F = build_features(A)")[0])  # reuse build_features, SERIES, H, TGP
F = build_features(A).sort_values(["series", "date"]).reset_index(drop=True)
for k in [1, 3, 7, 14]:
    F[f"mom{k}"] = F.groupby("series")["median"].diff(k)
F["off_28d_max"] = F["median"] - F.groupby("series")["median"].transform(lambda s: s.rolling(28, 7).max())
F["off_28d_min"] = F["median"] - F.groupby("series")["median"].transform(lambda s: s.rolling(28, 7).min())

FA = ["margin", "p10_margin", "tgp_chg1", "tgp_chg3", "tgp_chg7", "tgp_chg14", "tgp_chg28", "lo_spread",
      "hi_spread", "iqr", "upd1", "upd3", "upd7", "recent_minus_old", "gap_vs_regional_u91", "gap_vs_nsw_u91",
      "dow", "is_syd", "fuel_id"]
FB = FA + ["mom1", "mom3", "mom7", "mom14", "off_28d_max", "off_28d_min"]
FR = ["tgp_chg1", "tgp_chg3", "tgp_chg7", "tgp_chg14", "tgp_chg28", "margin", "is_syd", "fuel_id"]
PARAMS = dict(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=40, subsample=0.8,
              subsample_freq=1, colsample_bytree=0.8, reg_lambda=2.0, verbose=-1)
F = F.dropna(subset=["tgp_chg28"])


def fit_pred(tr, te, feats, y):
    m = lgb.LGBMRegressor(objective="huber", alpha=3.0, **PARAMS).fit(tr[feats], tr[y])
    return m, m.predict(te[feats])


rows, preds, cls = [], [], []
for m in pd.period_range("2026-01", "2026-08", freq="M"):
    t0 = m.start_time
    for h in H:
        y = f"y{h}"
        tr = F[(F.date + pd.Timedelta(days=h) < t0) & F[y].notna()]
        te = F[(F.date.dt.to_period("M") == m) & F[y].notna()]
        trB = tr.dropna(subset=FB); teB = te.dropna(subset=FB)
        # conformal calibration for model A
        cut = tr.date.max() - pd.Timedelta(days=45)
        mc, pc = fit_pred(tr[tr.date + pd.Timedelta(days=h) < cut], tr[tr.date >= cut], FA, y)
        q80 = np.quantile(np.abs(tr[tr.date >= cut][y] - pc), 0.8)
        _, pA = fit_pred(tr, te, FA, y)
        _, pB = fit_pred(trB, teB, FB, y)
        rid = Ridge(alpha=1.0).fit(tr[FR].fillna(0), tr[y])
        pR = rid.predict(te[FR].fillna(0))
        te = te.assign(pA=pA, pR=pR, lo=pA - q80, hi=pA + q80)
        te = te.merge(teB[["date", "series"]].assign(pB=pB), on=["date", "series"], how="left")
        for s, g in te.groupby("series"):
            mv = np.abs(g[y]) >= 1
            rows.append(dict(month=str(m), h=h, series=s, n=len(g),
                             naive=np.abs(g[y]).mean(), ridge=np.abs(g[y] - g.pR).mean(),
                             A=np.abs(g[y] - g.pA).mean(),
                             B=np.abs(g[y] - g.pB).mean() if g.pB.notna().any() else np.nan,
                             dirA=(np.sign(g.pA[mv]) == np.sign(g[y][mv])).mean() if mv.any() else np.nan,
                             cover=((g[y] >= g.lo) & (g[y] <= g.hi)).mean(), width=(g.hi - g.lo).mean()))
        preds.append(te[["date", "series", y, "pA", "pB", "pR", "lo", "hi"]].assign(h=h).rename(columns={y: "actual"}))
    tr = F[(F.date + pd.Timedelta(days=7) < t0) & F.y_jump7.notna()]
    te = F[(F.date.dt.to_period("M") == m) & F.y_jump7.notna()]
    pp = lgb.LGBMClassifier(**PARAMS).fit(tr[FA], tr.y_jump7).predict_proba(te[FA])[:, 1]
    cls.append(pd.DataFrame({"date": te.date, "series": te.series, "y": te.y_jump7, "p": pp, "base": tr.y_jump7.mean()}))

R = pd.DataFrame(rows); P = pd.concat(preds); C = pd.concat(cls)
R.to_csv("backtest_v2.csv", index=False); P.to_parquet("backtest_preds.parquet"); C.to_parquet("backtest_cls.parquet")
w = lambda d, c: np.average(d[c].fillna(d["naive"]), weights=d.n)
summ = R.groupby("h").apply(lambda d: pd.Series({k: w(d, k) for k in ["naive", "ridge", "A", "B"]} |
                                                 {"dirA": np.nanmean(d.dirA), "cover80": np.average(d.cover, weights=d.n),
                                                  "width": np.average(d.width, weights=d.n)}))
print("ALL SERIES MAE (c/L)\n", summ.round(2))
syd = R[R.series == "Sydney|U91"].groupby("h")[["naive", "ridge", "A", "B", "dirA", "cover"]].mean()
print("SYDNEY U91\n", syd.round(2))
calm = R[R.month.isin(["2026-01", "2026-02", "2026-05", "2026-06", "2026-08"])].groupby("h").apply(
    lambda d: pd.Series({k: w(d, k) for k in ["naive", "ridge", "A", "B"]}))
print("CALM MONTHS\n", calm.round(2))
shock = R[R.month.isin(["2026-03", "2026-04", "2026-07"])].groupby("h").apply(
    lambda d: pd.Series({k: w(d, k) for k in ["naive", "ridge", "A", "B"]}))
print("SHOCK/POLICY MONTHS\n", shock.round(2))
c = C.dropna(subset=["y"])
print("CLASSIFIER overall AUC", round(roc_auc_score(c.y, c.p), 3), "Brier", round(brier_score_loss(c.y, c.p), 3),
      "base", round(brier_score_loss(c.y, c.base), 3))
cs = c[c.series == "Sydney|U91"]
print("CLASSIFIER Sydney U91 AUC", round(roc_auc_score(cs.y, cs.p), 3))

# ---- final models on all data
final = {}
for h in H:
    d = F[F[f"y{h}"].notna()]
    cut = d.date.max() - pd.Timedelta(days=60)
    mc, pc = fit_pred(d[d.date + pd.Timedelta(days=h) < cut], d[d.date >= cut], FA, f"y{h}")
    q80 = np.quantile(np.abs(d[d.date >= cut][f"y{h}"] - pc), 0.8)
    # use the larger of recent and full-backtest conformal width (shock-aware)
    q80 = max(q80, np.quantile(np.abs(P[P.h == h].actual - P[P.h == h].pA), 0.8))
    final[h] = (lgb.LGBMRegressor(objective="huber", alpha=3.0, **PARAMS).fit(d[FA], d[f"y{h}"]), q80)
d = F[F.y_jump7.notna()]
clf = lgb.LGBMClassifier(**PARAMS).fit(d[FA], d.y_jump7)
imp = pd.Series(final[7][0].booster_.feature_importance("gain"), index=FA)
print("IMPORTANCE h7\n", (imp / imp.sum()).sort_values(ascending=False).round(3).head(10))
print("q80", {h: round(final[h][1], 1) for h in H})
pickle.dump({"final": final, "clf": clf, "FA": FA, "imp": (imp / imp.sum()).to_dict()}, open("models_v2.pkl", "wb"))
