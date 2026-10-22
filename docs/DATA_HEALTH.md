# Data health: alerts and fixes

The data-health workflow (`.github/workflows/data-health.yml`) checks the published app API after every pipeline run and every 30 minutes. It fixes what it can on its own, and opens a GitHub issue labelled `data-health` for everything else. The issue @mentions the owner, so GitHub sends an email and a mobile notification.

## How it works
1. **Prevention:** every run of `export_api.py` hides implausible station prices before they're published. A price is hidden if it's more than 45c under or 80c over its fuel's Sydney median, or outside 80–600c. The widest real gaps in the stored snapshots are −22c and +37c. Hidden prices are listed in `meta.warnings` and in the health summary; they don't raise an alert.
2. **Detection:** `sydney/pipeline/health.py` reads the live API the way the app does, cache-busted. It checks:
   - freshness;
   - that the core files, station files, track record and share page exist;
   - forecast sanity;
   - the latest pipeline run's result, and whether the schedule is switched on;
   - the station count;
   - how many NSW prices changed in the last day;
   - outliers;
   - day-on-day median jumps;
   - the pipeline's own warnings.
3. **Auto-fix:** `sydney/pipeline/remediate.py` starts a new pipeline run (`daily.yml`) for any problem a rerun usually clears. It also re-enables the schedule if GitHub paused it. Limits:
   - never while a run is queued or running;
   - not within 12 minutes of a successful run;
   - at most 4 runs per Sydney day, at least 40 minutes apart;
   - none at all once 12 pipeline runs of any kind have started that day. This hard stop ends any loop, even if GitHub changes how it labels the bot.
4. **Alert:** an alert goes out straight away for problems a rerun can't fix. A fixable problem alerts only once an automatic run has tried and failed, or the day's 4 runs are used up; then the issue also gets the `needs-human` label. The issue gets a comment only when the set of problems changes, and it closes itself once everything passes.

Every check's result is on its run page: Actions → data-health → the run → Summary.

## What each alert means

| Code | Severity | Auto-fix | What to do if it stays |
|---|---|---|---|
| API_STALE | critical | rerun | Today's data never published. Open the failed daily-forecast run. Usually it's `fetch.py` (NSW API down, or the key expired: renew `NSW_API_KEY`/`NSW_API_SECRET` on api.nsw.gov.au) or an `export_api` check. |
| RUN_FAILED | critical | rerun | Read the run's log. A "data branch moved during the build" error clears itself. A Pages deploy error: re-run the deploy job. |
| RUN_OVERDUE | warning | rerun | Between 07:30 and 23:30, data more than 5.5 h old means GitHub skipped a scheduled run. Nothing to do unless it repeats all day. |
| WORKFLOW_DISABLED | critical | re-enable | If it was disabled by hand, re-enable it in Actions → daily-forecast. |
| API_UNREACHABLE / FILE_MISSING / FILE_BAD | critical | rerun | Check Settings → Pages and the last deploy job. |
| FORECAST_BAD | critical | rerun | The model produced impossible numbers. Check `store/` on the `data` branch (brent/tgp inputs) and run `run_daily.sh` locally on a copy. |
| SCHEMA | critical | – | A pipeline change bumped the API schema. Revert it, or ship an app update first. |
| STATIONS_FEW | warning or critical | rerun | NSW returned a partial feed. If it persists, compare with fuelcheck.nsw.gov.au. |
| NSW_STALE | warning | rerun | Few prices changed in a day. Check NSW API status; the feed may be lagging. |
| PRICE_OUTLIER | warning | – | The quarantine didn't hide an absurd price. Check that `export_api.py` ran and that its bounds are right. |
| MEDIAN_JUMP | warning | – | The median moved more than 50c in a day (real hikes reach 39c), or spiked 15c+ and snapped back the next day. Almost always a bad snapshot: compare with fuelcheck.nsw.gov.au. |
| INPUT_TGP / INPUT_MACRO | warning | – | AIP, EIA or RBA stopped updating, usually because a file or page moved. Run `python sydney/pipeline/fetch.py <copy> <copy>/inbox` and read the error. |
| STATION_FILES / TRACK / SHARE_PAGE | warning | rerun | A part of the export failed soft. The error text is in the alert and in `meta.warnings`. |
| META_WARNING | warning | – | A new warning text from the pipeline. Read it, and add a mapping in `health.py`. |
| QUARANTINED, HISTORY_LAG | info | – | No alert. Prices hidden automatically, or NSW's monthly file is late. |

## Running it by hand
- **Check the live data:** `python3 sydney/pipeline/health.py`. Point it at a local export with `python3 sydney/pipeline/health.py <OUT dir>`.
- **See what the monitor would do:** `GITHUB_REPOSITORY=nathann2997/FuelForecast python3 sydney/pipeline/remediate.py report.json --dry-run`. This only reads from GitHub.
- **Tests:** `python3 -m unittest sydney/pipeline/test_health.py`. The workflow runs them before every check.
- **Run a check now:** Actions → data-health → Run workflow.

## Limits
- The monitor itself runs on GitHub's scheduler. If GitHub drops its runs too, nothing checks. The run after each pipeline run is the backstop.
- It watches the app's API (the GitHub Actions pipeline), not the Claude scheduled task's dashboard.
