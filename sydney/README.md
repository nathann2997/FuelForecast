# Sydney Pump Price Outlook

Daily forecast of Sydney pump prices (U91, E10, Premium 98, diesel): a "fill up now or wait" signal, a 14-day outlook, a station finder and the evidence behind it.

## Daily flow
A Claude scheduled task runs every morning (6:52am Sydney):
1. Pulls today's inputs through Chrome: NSW FuelCheck live prices (`pipeline/pull_nsw.js`), any newly published NSW monthly history (`pipeline/pull_history.js`), AIP terminal gate prices (`pipeline/find_aip.js`), and Brent + AUD/USD from FRED.
2. Runs `pipeline/run_daily.sh`: rebuilds history when a new month arrives (`build_history.py`), adds today's snapshot (`update.py`), retrains and forecasts (`model.py`), renders the dashboard (`build.py`).
3. Republishes `out/sydney-pump-outlook.html` as the dashboard (a claude.ai artifact).
4. Commits and pushes all changes to this repo.

The walk-forward backtest (`model.py --backtest`, about 8 minutes) reruns on the first Monday of each month.

## Credentials
API keys live in `pipeline/credentials.py` and `pipeline/pull_nsw.js`, which are gitignored. Copy `credentials.example.py` / `pull_nsw.example.js` and fill in your keys.

## Layout
| Path | What |
|---|---|
| `pipeline/` | all code |
| `store/daily.csv` | Sydney daily price summary per fuel, Jan 2019 onward (history + daily snapshots) |
| `store/events/` | Sydney price-change records from the NSW monthly files |
| `store/tgp.csv`, `store/fred.csv` | wholesale TGP (AIP), Brent and AUD/USD (FRED) |
| `store/backtest*` | walk-forward backtest results |
| `store/forecast.json`, `store/stations_today.json` | today's forecast and station prices |
| `archive/` | daily station-level Sydney snapshots (gzipped JSON) |
| `out/sydney-pump-outlook.html` | the dashboard |

Sydney = postcodes 2000-2234, 2555-2574, 2740-2786. Prices in cents per litre incl. GST.
Sources: NSW Government FuelCheck (API.NSW, data.nsw.gov.au), Australian Institute of Petroleum, FRED (Federal Reserve Bank of St. Louis).
