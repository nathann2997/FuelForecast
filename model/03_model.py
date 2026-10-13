"""Snapshot-feature forecasting model for NSW retail fuel prices.

Design: every feature can be computed from ONE call to the live FuelCheck /prices endpoint
(price level, dispersion, how recently stations changed price, cross-region and cross-fuel gaps,
calendar). So the model runs daily off the live API with no stored history, and history only
improves it.

Targets: change in the series median over the next h days (h = 1, 3, 7, 14), and the
probability of a >= 5c rise within 7 days (a 'restoration' / price jump).
Validation: expanding-window walk-forward by month, Jan-Aug 2026, vs naive (no change).
"""
import json, warnings
import numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import mean_absolute_error, roc_auc_score, brier_score_loss

warnings.filterwarnings("ignore")
A = pd.read_parquet("/home/claude/fuel/daily_region.parquet")
TGP = pd.read_csv("/home/claude/fuel/tgp_sydney.csv", parse_dates=["date"]).set_index("date")
TGP = TGP.reindex(pd.date_range("2025-09-01", "2026-10-31")).ffill()
TGP_L = TGP.shift(1)   # published with a lag: only use yesterday's wholesale price
SERIES = [("Sydney", "U91"), ("Sydney", "E10"), ("Sydney", "P98"), ("Sydney", "DL"),
          ("NSW", "U91"), ("NSW", "DL"), ("NSW", "E10"), ("NSW", "P98"),
          ("Regional NSW", "U91"), ("Regional NSW", "DL"),
          ("Newcastle & Hunter", "U91"), ("Illawarra", "U91"), ("Central Coast", "U91"),
          ("Newcastle & Hunter", "DL")]
H = [1, 3, 7, 14]


def build_features(A):
    piv = A.set_index(["date", "region", "fuel"])
    reg_u = piv.xs(("Regional NSW", "U91"), level=("region", "fuel"))["median"]
    nsw_u = piv.xs(("NSW", "U91"), level=("region", "fuel"))["median"]
    nsw_d = piv.xs(("NSW", "DL"), level=("region", "fuel"))["median"]
    out = []
    for r, f in SERIES:
        g = piv.xs((r, f), level=("region", "fuel")).copy()
        g = g[g.n >= 20]
        x = pd.DataFrame(index=g.index)
        x["median"] = g["median"]
        x["lo_spread"] = g["median"] - g.p10          # how far the cheap tail sits below the middle
        x["hi_spread"] = g.p90 - g["median"]
        x["iqr"] = g.p75 - g.p25
        x["upd1"], x["upd3"], x["upd7"] = g.share_upd_1d, g.share_upd_3d, g.share_upd_7d
        x["recent_minus_old"] = g.recent_minus_old     # are recent re-pricers above (restoring) or below (discounting)?
        x["gap_vs_regional_u91"] = g["median"] - reg_u.reindex(g.index)   # Regional = slow wholesale proxy
        x["gap_vs_nsw_u91"] = g["median"] - nsw_u.reindex(g.index)
        x["dl_minus_u91_nsw"] = (nsw_d - nsw_u).reindex(g.index)
        tg = TGP_L["tgp_dl" if f == "DL" else "tgp_ulp"].reindex(g.index)
        tgs = TGP_L["tgp_dl" if f == "DL" else "tgp_ulp"]
        x["margin"] = g["median"] - tg
        x["p10_margin"] = g.p10 - tg
        for k in [1, 3, 7, 14, 28]:
            x[f"tgp_chg{k}"] = (tgs - tgs.shift(k)).reindex(g.index)
        x["dow"] = g.index.dayofweek
        x["series"] = f"{r}|{f}"
        x["is_syd"] = int(r == "Sydney")
        x["fuel_id"] = ["U91", "E10", "P98", "DL"].index(f)
        for h in H:
            x[f"y{h}"] = g["median"].shift(-h) - g["median"]
        x["y_jump7"] = (g["median"].rolling(7).max().shift(-7) - g["median"] >= 5).astype(float)
        x.loc[x["y7"].isna(), "y_jump7"] = np.nan
        out.append(x.reset_index())
    return pd.concat(out, ignore_index=True)


F = build_features(A)
FEATS = ["margin", "p10_margin", "tgp_chg1", "tgp_chg3", "tgp_chg7", "tgp_chg14", "tgp_chg28", "lo_spread", "hi_spread", "iqr", "upd1", "upd3", "upd7", "recent_minus_old",
         "gap_vs_regional_u91", "gap_vs_nsw_u91", "dow", "is_syd", "fuel_id"]
F.to_parquet("/home/claude/fuel/features.parquet", index=False)

PARAMS = dict(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=40,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=2.0, verbose=-1)

months = pd.period_range("2026-01", "2026-08", freq="M")
res, cls_rows, cov = [], [], []
for m in months:
    test_start = m.start_time
    for h in H:
        tr = F[(F.date + pd.Timedelta(days=h) < test_start) & F[f"y{h}"].notna()]
        te = F[(F.date.dt.to_period("M") == m) & F[f"y{h}"].notna()]
        if te.empty:
            continue
        mdl = lgb.LGBMRegressor(objective="huber", alpha=3.0, **PARAMS).fit(tr[FEATS], tr[f"y{h}"])
        q10 = lgb.LGBMRegressor(objective="quantile", alpha=0.1, **PARAMS).fit(tr[FEATS], tr[f"y{h}"])
        q90 = lgb.LGBMRegressor(objective="quantile", alpha=0.9, **PARAMS).fit(tr[FEATS], tr[f"y{h}"])
        p, lo, hi = mdl.predict(te[FEATS]), q10.predict(te[FEATS]), q90.predict(te[FEATS])
        y = te[f"y{h}"].values
        for s in te.series.unique():
            k = (te.series == s).values
            res.append(dict(month=str(m), h=h, series=s, n=k.sum(),
                            mae_model=mean_absolute_error(y[k], p[k]),
                            mae_naive=mean_absolute_error(y[k], np.zeros(k.sum())),
                            dir_acc=np.mean(np.sign(p[k][np.abs(y[k]) >= 1]) == np.sign(y[k][np.abs(y[k]) >= 1]))
                            if (np.abs(y[k]) >= 1).any() else np.nan))
        cov.append(dict(month=str(m), h=h, coverage=np.mean((y >= lo) & (y <= hi)), width=np.mean(hi - lo)))
    tr = F[(F.date + pd.Timedelta(days=7) < test_start) & F.y_jump7.notna()]
    te = F[(F.date.dt.to_period("M") == m) & F.y_jump7.notna()]
    clf = lgb.LGBMClassifier(**PARAMS).fit(tr[FEATS], tr.y_jump7)
    pp = clf.predict_proba(te[FEATS])[:, 1]
    base = tr.y_jump7.mean()
    cls_rows.append(dict(month=str(m), n=len(te), rate=te.y_jump7.mean(),
                         auc=roc_auc_score(te.y_jump7, pp) if te.y_jump7.nunique() > 1 else np.nan,
                         brier=brier_score_loss(te.y_jump7, pp),
                         brier_base=brier_score_loss(te.y_jump7, np.full(len(te), base))))

R = pd.DataFrame(res); C = pd.DataFrame(cls_rows); V = pd.DataFrame(cov)
R.to_csv("/home/claude/fuel/backtest_reg.csv", index=False)
C.to_csv("/home/claude/fuel/backtest_cls.csv", index=False)
V.to_csv("/home/claude/fuel/backtest_cov.csv", index=False)

w = lambda d, c: np.average(d[c], weights=d.n)
summ = R.groupby("h").apply(lambda d: pd.Series({"mae_model": w(d, "mae_model"), "mae_naive": w(d, "mae_naive"),
                                                 "dir_acc": np.nanmean(d.dir_acc)}))
summ["skill_vs_naive"] = 1 - summ.mae_model / summ.mae_naive
print("REGRESSION (all series, Jan-Aug 2026 walk-forward)\n", summ.round(3))
syd = R[R.series == "Sydney|U91"].groupby("h").apply(
    lambda d: pd.Series({"mae_model": d.mae_model.mean(), "mae_naive": d.mae_naive.mean()}))
syd["skill"] = 1 - syd.mae_model / syd.mae_naive
print("SYDNEY U91\n", syd.round(2))
print("BY MONTH h=7\n", R[R.h == 7].groupby("month").apply(
    lambda d: pd.Series({"model": w(d, "mae_model"), "naive": w(d, "mae_naive")})).round(2))
print("CLASSIFIER P(rise>=5c in 7d)\n", C.round(3))
print("INTERVAL coverage (target 80%)\n", V.groupby("h")[["coverage", "width"]].mean().round(2))

# final models on all data -> feature importance
imp = {}
final = {}
for h in H:
    d = F[F[f"y{h}"].notna()]
    final[h] = [lgb.LGBMRegressor(objective=o, alpha=a, **PARAMS).fit(d[FEATS], d[f"y{h}"])
                for o, a in [("huber", 3.0), ("quantile", 0.1), ("quantile", 0.9)]]
    imp[h] = dict(zip(FEATS, final[h][0].booster_.feature_importance("gain")))
d = F[F.y_jump7.notna()]
final_clf = lgb.LGBMClassifier(**PARAMS).fit(d[FEATS], d.y_jump7)
imp7 = pd.Series(imp[7]); print("IMPORTANCE h=7\n", (imp7 / imp7.sum()).sort_values(ascending=False).round(3))
import pickle
pickle.dump({"final": final, "clf": final_clf, "FEATS": FEATS, "imp": imp}, open("/home/claude/fuel/models.pkl", "wb"))
