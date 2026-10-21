# Changelog

All notable changes to the FuelForecast pipeline and app. Newest first.

## 2026-10-21 — Bowser 0.3.0: rebrand, pinned stations, filters, directions, station page, Android widget

Plan and specs: `docs/BOWSER_PLAN.md`. Brand: `docs/BRAND.md`. Ships together with the v0.2 redesign below as one commit. **Needs a new APK** (native widget code, new launcher name and icon); `version` 0.1.0 → 0.3.0, so 0.1.0 installs don't get it over the air.

### Rebrand
- The app is now **Bowser**, with no subtitle. Changed: launcher name, icon, adaptive and monochrome icons, splash (higher resolution, shown larger), favicon, the wordmark on Today, the About block in More, the widget, `app/README.md` and `docs/TESTING.md`. iOS now uses `icon.png` (the unused `assets/expo.icon` is removed).
- Unchanged on purpose: Android package, iOS bundle id, slug, EAS project, URL scheme `fuelforecast`, repo and API URLs, and the web dashboard (owned by the Claude task).
- Logo: a "B" that is also a petrol bowser (concept B of 3, `docs/brand/concepts.png`). Sources in `app/assets/brand/`, component `components/brand.tsx`.

### Added
- **Pinned stations** (`lib/pins.ts`, up to 10, kept on the phone). They appear in "Your stations" on Today and in a Pinned group at the top of Stations. A pinned station shows "No U91 here" or "Not in today's prices" when it has no price.
- **Filters sheet** (`components/filter-sheet.tsx`, `lib/filters.ts`) covers sort, radius, brands (with search), when to fill, max price, members-only, old prices, and pinned only. The settings persist and Reset clears them.
- **One-tap Directions** on every row and on the station page (`lib/directions.ts`): Google Maps navigation on Android, Apple Maps on iOS, and the web URL as a fallback.
- **Station page** `/station/[id]` (`app/station/[id].tsx`, `components/ticker-chart.tsx`, `lib/station.ts`): a ticker-style price block, a chart (1W–1Y) with the Sydney median and a dotted 14-day forecast with a likely-range band, range stats, the station's own forecast, and how the station behaves. Tapping a station row opens it. Also opens from `fuelforecast://station/<id>`.
- **Android home-screen widget** (`src/widget/`, `react-native-android-widget` 0.23.0). The small size shows the verdict and rise date. The medium size adds pinned stations, or the cheapest near your area. Refreshes every 4 h and whenever the app's data, pins or settings change. The app entry is now `app/index.ts`.
- **API: `api/v1/station/{id}.json`** for each station (`sydney/pipeline/station_api.py`): 400 days of daily prices, the behaviour profile and a station forecast. `stations.json` gains `id` (the NSW station code). The schema stays 1 (additive). If station files fail, only they are skipped; the export still publishes and adds a `meta.warnings` entry.
- Routing: a root Stack with a `(tabs)` group, so pushed screens sit over the tabs.

### Changed
- `export_api.py` adds the ids and calls `station_api`. `build.py`, the dashboard, `forecast.json` and `history.json` are byte-identical to before (QA checked). Export time goes from about 1.4 s to 8 s, and the Pages artifact from 1.5 MB to 11 MB.
- The persisted query cache key is now `schema-1-ids`, so old cached station lists without ids are dropped.
- `app.json`: `expo-build-properties` with `enableMinifyInReleaseBuilds: false`. The widget library has an open release crash under R8 (issue #159). Keep rules are included for when we turn minify back on.
- More shows pipeline warnings in plain English.

### QA audit (independent QA agent): 1 blocker and 8 should-fix items, all fixed
- Blocker: rows from a `stations.json` without ids made every row look pinned and opened `/station/undefined`. Fixed in three ways:
  - id-less rows have no pin and don't navigate;
  - `togglePin` ignores empty ids;
  - the cache key above discards old cached lists.
  The release order below still applies.
- The widget no longer reuses yesterday's data from a backgrounded app. Its settings are normalised and its cache is written asynchronously.
- The station page uses the same "Likely to rise" / "Jump possible" wording rule as Today.
- Tap targets in the filters UI are now 44 dp. Selected brands stay visible after a fuel change. Pinned rows with no price no longer count in the header.
- Splash re-exported at 684×639. The tester guide is updated.
- Nice-to-haves done:
  - the chart takes the touch only on a sideways drag, so the page scrolls;
  - deep-link ids are validated;
  - station queries are kept for 6 h;
  - the `station_api` import is fail-soft;
  - a price unchanged in the monthly history is carried forward up to 180 days.
- Remaining gaps in station history are genuine (new or rebranded station codes, or a fuel the station stopped selling).

### Release order (must follow)
1. Push to `main`, then run the daily workflow (`workflow_dispatch`) and confirm the live `stations.json` has `id` and `station/<id>.json` loads.
2. Only then build the 0.3.0 preview APK (`npx eas-cli@latest build -p android --profile preview`) and share it.

### Verified
- `tsc`, `expo lint`, `jest` 73/73, `expo-doctor` 20/20, and `expo export` for Android and web all pass.
- Prebuild (scratch copy) shows the widget receivers labelled Bowser, the provider XML and the keep rules.
- An integrated web preview against the scratch API covered Today (wordmark and pins), Stations, the filters sheet, and the station page in light and dark.
- **Not yet on a device:** widget placement, refresh and taps, the release APK launching, chart scrubbing, and the directions intent.

## 2026-10-21 — App v0.2 redesign (UX/UI), JS only

Product-design review and redesign of the app; rationale and before/after in `docs/DESIGN.md`. Pipeline, API, verdict rule and station advice unchanged; everything new is derived on the device.

### Changed
- Tabs are now Today · Stations · Trends · More (`history.tsx` → `trends.tsx`, `about.tsx` → `more.tsx`).
- **Today**: decision hero coloured by tone (act / wait / calm) with the shared verdict headline, the Sydney "likely to rise from" date, the saving in dollars for the user's tank, and a 14-day sparkline with the 80% range (replaces the four forecast tiles and the jump-risk tile). Adds the 3 cheapest fresh stations near the saved area (or a one-tap area setup). The "why" text and the stats are in a collapsed section.
- **Stations**: remembered area (GPS or suburb) in a bar at the top; the Sydney rise date shown once; compact rows that expand to show the reason, the saving and Directions (a tap no longer opens Maps straight away); chip filters; prices older than 7 days hidden by default; paging of 30, which resets when any filter changes.
- **Trends**: chart, three cycle insights, cheapest brands; other facts and the chart notes collapsed.
- **More**: settings (fuel, tank size, area, members-only sites), a one-line accuracy summary with the table collapsed, model card collapsed, data freshness, sources.
- Visual system: decision-tone tokens in `constants/theme.ts`, tabular figures instead of monospace, no dark "board" in light mode. The fuel switch is a header chip with a bottom sheet.

### Added
- `lib/outlook.ts`: port of `market()` in `sydney/pipeline/build.py` (the rise day) plus the headline and saving copy. Checked against the 21 Oct data: U91 Sat 24 Oct, E10 Fri 23 Oct, P98 Tue 27 Oct, diesel none, identical to the station advice.
- `components/outlook-chart.tsx`, `components/station-row.tsx`, `components/area-picker.tsx`, `hooks/use-area.ts`, `lib/location.ts`.
- Settings `tankL` (50), `home` (remembered area), `showStale` (false); v0.1 settings merge with the defaults.
- Tests for the path interpolation, the rise day, the headline/deadline rules and the tank saving (14 tests in total).

### QA audit (independent QA agent) — no blockers; fixes applied
- The hero could show a firm rise deadline under a "Wait" or "No rush" verdict (the jump-hazard rule fires from p_jump7 ≈ 0.13; the verdict only from 0.35). The deadline now appears only for "act"; otherwise a softer "some chance of a jump from …" line. A "No rush" verdict with a slow +3c-or-more drift no longer says prices stay flat.
- A GPS area is now refreshed when the app returns to the foreground, and falls back to a fresh fix when there is no recent one.
- `Screen` is wrapped in a `KeyboardAvoidingView` (Android SDK 58 is edge-to-edge), so the suburb search on Today isn't hidden behind the keyboard. **Verify on a device.**
- TalkBack: only the station header toggles, and its details are separate elements. The fuel sheet has a labelled close button and its options are reachable.
- Paging resets on any filter change; the area editor in More has Cancel and a loading state.
- Not changed: the "Shop around" insight still assumes a 50 L tank (dashboard parity).

### Release notes
- Not shipped on its own: it is bundled into Bowser 0.3.0 above (new APK).

## 2026-10-21 — Phase 4: tester distribution (APK + OTA updates, Expo Go)

### Added
- EAS project `@nathann97/fuel-forecast` (ID `29af590d-…`), linked in `app/app.json` (`owner`, `extra.eas.projectId`, `updates.url`).
- `expo-updates` with `runtimeVersion: { policy: "appVersion" }` (runtime = `version`, 0.1.0).
- `app/eas.json`: `preview` profile builds an internal-distribution APK on channel `preview`; `production` on channel `production`.
- First preview APK built in ~25 min incl. free-tier queue (107 MB universal APK; Android keystore generated and stored by EAS) and first update published to channel `preview` (group `85a68db2-…`).
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
