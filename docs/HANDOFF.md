# Session handoff — Bowser (FuelForecast) mobile app

Working notes so a fresh session can resume. Update before ending a session (or at ~70% context).

## Product decisions (from the owner, 2026-10-21)
- Audience: the owner plus a handful of friends. Android POC first, iOS later.
- MVP: "fill now / wait" signal + 1/3/7/14-day outlook, price history charts, station **list** (nearest within a radius; no map), same as the dashboard.
- Data freshness: once daily (as now). No accounts, no push alerts. Sydney only.
- Stack: React Native + Expo (TypeScript), EAS Build APK via internal distribution link.
- Constraint: keep the existing Claude-task flow working; the app is a parallel "clone and rebuild".

## Plan status
- [x] Phase 1 — headless pipeline (`fetch.py`, `.github/workflows/daily.yml`)
- [x] Phase 2 — static JSON API (`export_api.py`)
- [x] Go-live (2026-10-21): QA audit + fixes, pushed to main, secrets set, Pages enabled, first run passed in 94 s (run 39513415528), `data` branch seeded, API live
- [~] Phase 3 — Expo app in `/app` built (tabs now Today / Stations / Trends / More under `src/app/(tabs)/`; react-query + expo-sqlite kv-store cache, expo-location, custom react-native-svg chart instead of victory-native). QA audited and fixed, committed. Not yet run on a real Android device (next: Expo Go on the owner's phone).
- [x] App v0.2 UX redesign (2026-10-21, session fuel-dco-21): see `docs/DESIGN.md` and CHANGELOG. Tabs Today / Stations / Trends / More; the Sydney rise date is computed on the device in `lib/outlook.ts` (port of `market()` in `build.py`; change both together). QA audited and fixed; not yet committed (bundled with the Bowser/v0.3 work run by session fuel-dco-48, see `docs/BOWSER_PLAN.md`). Not yet seen on a device: check keyboard avoidance on Today's suburb search and the fuel bottom sheet.
- [~] **Bowser 0.3.0** (2026-10-21): rebrand plus pins, filters, directions, station page, Android widget and the per-station API. See `docs/BOWSER_PLAN.md` and CHANGELOG. QA audited and fixed, committed locally. **Next:** push, run the workflow and confirm `id` and `station/` are live, then build the APK (see "Release order" in CHANGELOG). Then test on a device: the widget (placement, 4 h refresh, taps, release launch without the R8 crash), chart scrubbing, directions, keyboard avoidance on Today.
- [~] Phase 4 — EAS project `@nathann97/fuel-forecast` linked; first preview APK built (build 2d86c615, 107 MB universal APK, install page https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/2d86c615-d10f-4f6f-978b-1cd0696726ec); update published to channel `preview`; tester guide `docs/TESTING.md`. Next: share the install link, collect tester feedback, verify OTA reaches an installed APK.

## Key facts
- Node 22 at `~/.local/node/bin` (on PATH via `~/.zshrc`); run app checks with `cd app && npx tsc --noEmit && npx expo lint && npx jest`.
- Browser preview: `npx expo export --platform web`, serve with an SPA fallback, screenshot with headless Chrome at >=500 px width.
- API base: `https://nathann2997.github.io/FuelForecast/api/v1/` (see `sydney/README.md` for the file schema).
- `stations.json` per-fuel tuple: `[price, days since update, advice code, advice label, reason]`; advice codes: now, by, ok, wait, hi, any, chk.
- Verdict rule lives in `template.html` (`verdict()`) and is mirrored in `export_api.py` — change both together.
- Workflow state lives on the `data` branch, never on `main`; `main` stays owned by the Claude task.
- Secrets never in git: `sydney/pipeline/credentials.py`, `sydney/pipeline/pull_nsw.js`, `fuel-api-credentials.md` are gitignored.

## Open risks
- Widget library `react-native-android-widget` has open issues: #159 (R8 release crash, mitigated by turning minify off), #154 (taps can stop after many redraws; patch in PR #161 if testers hit it). No picker preview image yet.
- Station forecasts reuse the Sydney path, shifted by the station's lag and damped by how often it joins jumps. There's no mean reversion for stations already well above their usual price, and the ranges are Sydney-wide.
- History for 1–12 Oct 2026 is reconstructed from snapshots until the October monthly file lands.
- The "Shop around" insight (`copy.ts`) still assumes a 50 L tank, not the user's `tankL`.
- Expo Go can't load our EAS updates (runtime 0.1.0 vs exposdk:58.0.0); Expo Go is live-session only.
- Owner has two Expo accounts (nathann97, nathannguy); the project lives on nathann97.
- AIP / FRED worked from GitHub runners on the first run; both stay best-effort (model forward-fills, `meta.warnings` flags staleness).
- GitHub cron can start 10–30 min late; scheduled workflows pause after 60 days of no repo activity (daily `data` commits count).
- NSW FuelCheck licence terms matter only if the app goes public.
