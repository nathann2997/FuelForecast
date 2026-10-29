# Verdict rule analysis (2026-10-29)

Question: can the track record improve Bowser's advice? Data: the walk-forward backtest on the `data` branch (`store/backtest_preds.parquet`, `backtest_cls.parquet`, `daily.csv`, `tgp.csv`), 2021-01-01 to 2026-10-20, 2,096 days × 5 fuels, scored exactly as `track_api.py` does (week-after average median minus the call-day median). Value = cents per litre gained by following the call (Fill: +move, Wait: −move, No rush: 0), the same measure as the app's "Saved about $x a tank". Tuned on 2021–24, checked on 2025–26.

## Findings

1. **The cut-offs are fine.** The current rule (`verdict()` in `export_api.py`) earns 5.0 c/L per call, against 5.73 c/L for perfect hindsight: 87% of what's possible (about $2.50 of $2.87 on a 50 L tank). The best of ~12,000 cut-off combinations adds 0.06–0.09 c/L (under 5c a tank). Rules that maximise "% right" earn less money (they say No rush and Wait more), which confirms scoring by money, not hit rate. **No change.**
2. **The jump chance is reasonably honest.** In 2025–26 predicted and actual jump rates line up from 25% upward (e.g. 0.42 → 0.43, 0.73 → 0.71). Its weakness is jumps it rates near zero: days given under 5% saw a 7-day jump 8% of the time in 2025–26 (0.8% predicted). Recalibration wouldn't fix that.
3. **2026 is the real problem.** The rule captured 84–94% of the possible value each year 2021–25, but 64% in 2026. Prices followed wholesale in big sustained swings (U91 ~210c in early March → 260c late March → 150c late June → 239c late September), and the model, which is built around Sydney's price cycle, read sustained rises as the usual post-peak fall:
   - Wait calls before a 5c+ rise: 9 in 2025, 101 in 2026.
   - 7-day forecast error: about 4c a year in 2021–25, 8.4c in 2026; it under-predicted rises by 1.8c on average.
   - March 2026: 1.75 c/L of 9.75 possible.
4. **A rule-level guard is a trade-off, not a fix.** "No Wait when wholesale (TGP) rose 4c+ in the last 7 days" cuts Wait-before-a-jump from 12.5% to 4.1% in 2025–26 and edges value up (2026: 3.91 → 4.18 c/L), but costs 0.26 c/L in 2021–24. Not shipped. The better fix is in the model (`model.py`): e.g. weighting recent years, or features for sustained wholesale trends, judged by walk-forward on 2026.
5. **Live calls currently come from the reduced model.** `daily.csv` has gaps (2026-10-01 to 10-12 and 10-17 to 10-18; history ends 2026-09-30, snapshots start 10-13), so `model.py` drops the cycle-memory features and `live_model` is "no cycle memory". The app's tested figure replays the same reduced model (it reproduces track.json's counts exactly), so live and tested are compared like for like. The full model is worth +0.1 c/L overall and +0.4 c/L in 2026. It returns once October's history fills the gap.

## Next

- Model experiment for wholesale-driven trends (finding 3), judged on 2026 walk-forward value and Wait-before-a-jump.
- Confirm October 2026 history gets pulled so cycle memory comes back (finding 5).
- Once ~3 months of live calls are scored, compare live vs tested (finding 4 in the track record discussion: about one independent result a day, so earlier comparisons only catch a collapse).
