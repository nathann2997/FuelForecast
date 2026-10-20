# Changelog

All notable changes to the FuelForecast pipeline and app. Newest first.

## 2026-10-21 — Phase 1 & 2: headless pipeline in GitHub Actions + static app API

Goal: run the daily forecast without the Chrome-driven Claude task and publish JSON for the upcoming Android (Expo) app, **while keeping the existing Claude-task flow and dashboard working unchanged**.

### Added
- `sydney/pipeline/fetch.py` — Python port of the four Chrome pulls (`pull_nsw.js`, `pull_fred.js`, `find_aip.js`, `pull_history.js`). Writes the same files into the inbox so `run_daily.sh` / `update.py` consume them unchanged. NSW snapshot is required (exit 1); FRED, AIP and monthly history are best-effort. Reads `NSW_API_KEY` / `NSW_API_SECRET` from env, falling back to `credentials.py`.
- `sydney/pipeline/export_api.py` — runs `build.py` unchanged and writes `api/v1/{meta,forecast,stations,history}.json` plus the dashboard as `index.html`. Adds `verdict` per fuel (port of `verdict()` in `template.html`) and suburb centroids for radius search. Refuses to publish stale or broken output.
- `.github/workflows/daily.yml` — daily at 19:30 UTC (06:30 AEDT / 05:30 AEST) plus manual trigger. Code from `main`; state (`store/`, `archive/`) on a separate `data` branch, seeded from `main` on first run; output deployed to GitHub Pages. Backtest on the first Monday of the month.
- `CHANGELOG.md`, `docs/HANDOFF.md` (session handoff / working notes).

### Changed
- `sydney/README.md` — new "Headless run (GitHub Actions) and app API" section.
- `sydney/.gitignore` — ignore `out/site/` (local API export).

### Unchanged by design
- The Claude scheduled task, Chrome pull scripts, `run_daily.sh`, `update.py`, `model.py`, `build.py`, `template.html` and `main`'s `store/` are untouched by the new path.

### Verified
- `fetch.py` against live sources: NSW 10,585 prices, AIP workbook, FRED both series, data.nsw catalogue.
- History port vs the Chrome-produced `syd_events_202609.csv`: 48,455 / 48,469 rows identical; 66 differ by one minute (Excel time rounding) — no effect on daily aggregates or station profiles.
- Full dry run on a scratch copy: `run_daily.sh` + `export_api.py` in ~16 s; forecast 24 KB, stations 471 KB (50 KB gzipped, 866 stations), history 233 KB.

### QA audit (independent QA agent) — no blockers; fixes applied before commit
- `export_api.py`: `--allow-stale` was silently ignored (argv replaced before the check) — flag now read first.
- `daily.yml`: a failed model/export step discarded that day's state, and live snapshots can't be re-fetched → state is now saved whenever the fetch succeeded; Pages still deploys only on full success.
- `fetch.py`: Excel serial times were truncated (wrong minute in ~44% of whole-minute values) → rounded to the second.
- `fetch.py`: an HTML block/challenge page from FRED or AIP returned with HTTP 200 would crash `update.py` → bodies validated (`observation_date` header / xlsx `PK` signature) and treated as a soft failure.
- `export_api.py`: added `meta.warnings` when TGP is >10 days or FRED >21 days old (forward-filled inputs).
- Smaller: NSW request headers rebuilt per retry; no sleep after the final retry; clear error when credentials are missing; month files under 10k rows are skipped; sanity checks run before the verdict; explicit `ls-remote` check for the `data` branch; schedule re-enabled each run (60-day inactivity rule).
- Seed freshness: the owner's pending pipeline edits and store/archive/events were committed alongside, so the `data` branch seeds from current state (the workflow depends on `station_profile.py` and the updated `build.py`).
- Not changed: the public `data` branch republishes station-level FuelCheck snapshots — check API terms before any public launch.

### Learnings
- The Chrome dependency was never needed: every source works from a plain HTTP client.
- FRED's `fredgraph.csv` rejects requests with a spoofed browser User-Agent (connection dropped) but accepts plain ones. AIP accepts the browser UA.
- `forecast.json` reported `no cycle memory (daily history has a gap)` because the Claude task missed 17–18 Oct; a daily Actions cron removes that gap source.
- Remote `main` was still at the initial commit; local pipeline changes (incl. `station_profile.py`) had not been pushed by the Claude task.
