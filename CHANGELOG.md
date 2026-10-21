# Changelog

All notable changes to the FuelForecast pipeline and app. Newest first.

## 2026-10-21 — Phase 4: tester distribution (APK + OTA updates, Expo Go)

### Added
- EAS project `@nathann97/fuel-forecast` (ID `29af590d-…`), linked in `app/app.json` (`owner`, `extra.eas.projectId`, `updates.url`).
- `expo-updates` with `runtimeVersion: { policy: "appVersion" }` (runtime = `version`, 0.1.0).
- `app/eas.json`: `preview` profile builds an internal-distribution APK on channel `preview`; `production` on channel `production`.
- First preview APK build (Android keystore generated and stored by EAS) and first update published to channel `preview` (group `85a68db2-…`).
- `docs/TESTING.md`: tester guide (APK install, Expo Go live session) and owner commands.
- `.easignore` at the repo root so EAS uploads only `app/` (it replaces every `.gitignore`, so secret and build patterns are repeated in it).

### Changed
- Removed duplicated location permissions from `app/app.json` (the `expo-location` plugin adds them).

### QA audit — fixes applied before commit
- Expo Go cannot load the published update: Expo Go's runtime is `exposdk:58.0.0`, ours is `0.1.0`. Expo Go is documented as a live `npx expo start --tunnel` session instead; the APK is the main tester route.
- Updates download on one launch and apply on the next cold start (guide corrected).
- `version` bumps cut existing APKs off from updates; guide says bump only with a new APK for native changes.

### Learnings
- `eas update --non-interactive` needs `--environment`.
- In a repo where the app is a subfolder, EAS archives the whole git repo (first upload 53 MB, mostly pipeline data) unless a root `.easignore` exists.
- On Android, Expo Go needs no sign-in; the Play Store copy can lag a new SDK, so testers use https://expo.dev/go.

## 2026-10-21 — Phase 3: Android POC app (Expo SDK 58)

### Added
- `app/` — Expo / React Native (TypeScript) app reading the static API; four native tabs:
  - **Today**: verdict per fuel, the "why" text, 1/3/7/14-day outlook with 80% ranges, 7-day jump risk.
  - **Stations**: cheapest stations today; GPS "near me" or suburb/postcode search with suggestions, 2/5/10/20 km radius, cheapest/nearest sort, members-only toggle, per-station "when to fill" advice, tap for Google Maps directions.
  - **History**: SVG chart (median, cheapest-to-dearest band, wholesale TGP, forecast fan; 3M/1Y/3Y/All; drag to inspect), cycle insights, brand premiums.
  - **About**: model card, backtest table, data freshness incl. `meta.warnings`, sources, link to the web dashboard.
- Offline cache (TanStack Query persisted to `expo-sqlite/kv-store`, 2 days), stale-data banner, pull-to-refresh, persisted settings (fuel, radius, sort, members).
- `src/lib/copy.ts`, `geo.ts`, `chart.ts` — dashboard logic and wording ported from `template.html`; 10 jest tests (`src/lib/__tests__`).
- `app/eas.json` (preview profile builds an internal-distribution APK), `.github/workflows/app-ci.yml` (typecheck, lint, test, expo-doctor on changes to `app/`).
- Node 22 LTS installed to `~/.local/node` (PATH line added to `~/.zshrc`).

### QA audit (independent QA agent) — no blockers; fixes applied before commit
- Dashboard parity confirmed line by line (verdict, why text, horizon/jump thresholds, insights, backtest table, freshness limits, suburb search, advice colours, sort and defaults).
- Added a root `ErrorBoundary`; stats/ctx fields the pipeline can emit as null are typed nullable and render "–" instead of crashing (new test).
- `sydneyToday()` built from `formatToParts` (device ICU formats for en-CA vary on Android).
- Chart paths memoised per data/width so drag-to-inspect doesn't rebuild ~2,850-point paths on every move; tooltip logic simplified (it was blocking the React Compiler).
- Narrow-screen overflow on Today fixed (shrinkable text, wrapping rows).
- Stations: location has a 15 s timeout; radius/sort only shown once a location or suburb is set; advice colour falls back to neutral; handler renamed.
- Smaller: an undefined network state no longer counts as offline; stations tab icon is a list rather than an EV plug; Costco note restored on brand premiums; a11y roles on retry and chart; removed unused template packages (`@expo/ui`, `expo-device`, `expo-glass-effect`, `expo-image`, `expo-web-browser`), stale `reset-project` script, Expo-blue splash colour.
- Not committed: `app/.claude/settings.json` from the Expo template (enables an Expo plugin for Claude in this repo — owner's call).
- Open: not yet run on a physical Android device; chart scrubbing can yield to vertical scroll on Android.

### Verified
- `tsc --noEmit`, `expo lint`, `jest` (11/11), `expo-doctor` (20/20), `expo export --platform android` (3.5 MB Hermes bundle).
- Web preview rendered all four tabs with live API data in headless Chrome at phone width.

### Learnings
- SDK 58: NativeTabs import is `expo-router/native-tabs`; Android tab icons can use Material Symbols via `md="..."` with no image assets.
- TypeScript 6 no longer auto-loads global `@types/*`; tests import `describe/it/expect` from `@jest/globals`.
- `npx expo install <pkg> -- --save-dev` put jest packages in `dependencies`; moved to `devDependencies` by hand.
- `expo-sqlite/kv-store` on web needs cross-origin isolation headers, so the browser preview uses a `storage.web.ts` localStorage shim.
- Headless Chrome enforces a ~500 px minimum layout width, so 412 px screenshots look clipped; capture at 500 px.

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

### Go-live
- Pushed to `main`; repo secrets `NSW_API_KEY` / `NSW_API_SECRET` set; Pages enabled (GitHub Actions source).
- First run (manual) passed every step in 94 s: NSW 10,583 prices, FRED, AIP and the history check all worked from the GitHub runner; `data` branch seeded (`data: 2026-10-21`).
- Live at `https://nathann2997.github.io/FuelForecast/` (dashboard) and `/api/v1/` — served gzipped from the Sydney CDN edge with CORS `*` and a 10-minute cache: forecast 7 KB, stations 54 KB, history 42 KB over the wire.

### Learnings
- Pushing a workflow file needs the `workflow` OAuth scope on the `gh` token (`gh auth refresh -h github.com -s workflow`).
- The Chrome dependency was never needed: every source works from a plain HTTP client.
- FRED's `fredgraph.csv` rejects requests with a spoofed browser User-Agent (connection dropped) but accepts plain ones. AIP accepts the browser UA.
- `forecast.json` reported `no cycle memory (daily history has a gap)` because the Claude task missed 17–18 Oct; a daily Actions cron removes that gap source.
- Remote `main` was still at the initial commit; local pipeline changes (incl. `station_profile.py`) had not been pushed by the Claude task.
