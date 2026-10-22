# Sydney Pump Price Outlook

Daily forecast of Sydney pump prices (U91, E10, Premium 98, diesel): a "fill up now or wait" signal, a 14-day outlook, a station finder and the evidence behind it.

## Daily flow
A Claude scheduled task runs every morning (6:52am Sydney):
1. Pulls today's inputs through Chrome: NSW FuelCheck live prices (`pipeline/pull_nsw.js`), any newly published NSW monthly history (`pipeline/pull_history.js`), AIP terminal gate prices (`pipeline/find_aip.js`), and Brent + AUD/USD from FRED.
2. Runs `pipeline/run_daily.sh`: rebuilds history when a new month arrives (`build_history.py`), adds today's snapshot (`update.py`), retrains and forecasts (`model.py`), renders the dashboard (`build.py`).
3. Republishes `out/sydney-pump-outlook.html` as the dashboard (a claude.ai artifact).
4. Commits and pushes all changes to this repo.

The walk-forward backtest (`model.py --backtest`, about 8 minutes) reruns on the first Monday of each month.

## Headless run (GitHub Actions) and app API
`.github/workflows/daily.yml` runs the same pipeline with no browser, up to 5 times a day (see the cron slots in `daily.yml`), alongside the Claude task above and without touching `main`:
1. `pipeline/fetch.py` replaces the four Chrome pulls and writes the same files into `inbox/` (only the NSW snapshot is required; Brent/AUD, AIP and monthly history are best-effort). Brent comes from the US EIA (which sources it from Refinitiv) and AUD/USD from the RBA (sourced from WM/Reuters), not FRED, whose terms bar using its content to train models. Neither is relicensed here (see `DATA-LICENSE.md`). `update.py` replaces `store/fred.csv` with them, keeping the file name and FRED column ids, so `model.py` is unchanged.
2. `pipeline/run_daily.sh`, unchanged (with `--backtest` on the first Monday of the month).
3. `pipeline/export_api.py` runs `build.py` and writes the app API (with `station_api.py` for the per-station files), failing if the data isn't today's or a check fails.
4. State (`store/`, `archive/`) is committed to the `data` branch (seeded from `main` on the first run); the API and dashboard are deployed to GitHub Pages.

Needs repo secrets `NSW_API_KEY` / `NSW_API_SECRET` and Pages set to deploy from GitHub Actions.

API (`https://nathann2997.github.io/FuelForecast/api/v1/`), static JSON regenerated daily:
| File | What |
|---|---|
| `meta.json` | schema version, generated time, as-of date per source, file sizes (`station/` = total bytes of the station files, `station/count` = how many). Check `asof` for staleness |
| `forecast.json` | `live[]` per fuel (now, d1/d3/d7/d14 with lo/hi ranges, p_jump7, `verdict`), `ctx`, `stats`, `brands`, `bt` (backtest) |
| `stations.json` | `stations[]` with `id` (NSW station code) and `p: {fuel: [price, days since update, advice code, advice label, reason, 7-day forecast price]}` (index 5 = the station file's `fc.now + fc.d7`; left off, tuple length 5, on a day the station files failed); `suburbs[]` centroids for radius search |
| `station/{id}.json` | one station (`StationDetail` in `app/src/lib/types.ts`): `hist[fuel]` end-of-day price for the 400 days from `start` to `asof` (monthly history, then the `archive/` snapshots, then today; carried forward up to 30 days, else null), `profile` (`typ`, `lag`, `part`, `n`), and `fc[fuel]`, the station's own 14-day forecast (`now`, d/lo/hi at 1/3/7/14 days, `rise` date, `adv` as in `stations.json`). Method in `pipeline/station_api.py`. About 8 KB each |
| `history.json` | `hist[fuel].{med,p10,p90}` and `tgp.{ulp,dl}`, daily from `start` |

## Credentials
API keys live in `pipeline/credentials.py` and `pipeline/pull_nsw.js`, which are gitignored (`fetch.py` reads env `NSW_API_KEY` / `NSW_API_SECRET` first). Copy `credentials.example.py` / `pull_nsw.example.js` and fill in your keys.

## Layout
| Path | What |
|---|---|
| `pipeline/` | all code |
| `store/daily.csv` | Sydney daily price summary per fuel, Jan 2019 onward (history + daily snapshots) |
| `store/events/` | Sydney price-change records from the NSW monthly files |
| `store/tgp.csv`, `store/fred.csv` | wholesale TGP (AIP), Brent and AUD/USD (FRED for the Claude task; EIA and RBA on the `data` branch) |
| `store/backtest*` | walk-forward backtest results |
| `store/forecast.json`, `store/stations_today.json` | today's forecast and station prices |
| `archive/` | daily station-level Sydney snapshots (gzipped JSON) |
| `out/sydney-pump-outlook.html` | the dashboard |

Sydney = postcodes 2000-2234, 2555-2574, 2740-2786. Prices in cents per litre incl. GST.
Sources: NSW Government FuelCheck (API.NSW, data.nsw.gov.au; CC BY-SA 3.0 AU), Australian Institute of Petroleum (© AIP), Brent crude from the U.S. Energy Information Administration (Refinitiv), AUD/USD from the Reserve Bank of Australia (WM/Reuters); the Claude task's Chrome pull still uses FRED. Licence and attribution for the data and the API: [`DATA-LICENSE.md`](../DATA-LICENSE.md). Every API file carries `generated_at` (the app's "Refreshed" time), plus `attribution` and `license_note`.
