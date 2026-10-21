# Session handoff — FuelForecast mobile app

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
- [~] Phase 3 — Expo app in `/app` built (Today / Stations / History / About; react-query + expo-sqlite kv-store cache, expo-location, custom react-native-svg chart instead of victory-native). QA audited and fixed, committed. Not yet run on a real Android device (next: Expo Go on the owner's phone).
- [ ] Phase 4 — EAS Build preview APK (needs owner's Expo account login: `npx eas-cli@latest login`), EAS Update. CI for `/app` done (`app-ci.yml`).

## Key facts
- Node 22 at `~/.local/node/bin` (on PATH via `~/.zshrc`); run app checks with `cd app && npx tsc --noEmit && npx expo lint && npx jest`.
- Browser preview: `npx expo export --platform web`, serve with an SPA fallback, screenshot with headless Chrome at >=500 px width.
- API base: `https://nathann2997.github.io/FuelForecast/api/v1/` (see `sydney/README.md` for the file schema).
- `stations.json` per-fuel tuple: `[price, days since update, advice code, advice label, reason]`; advice codes: now, by, ok, wait, hi, any, chk.
- Verdict rule lives in `template.html` (`verdict()`) and is mirrored in `export_api.py` — change both together.
- Workflow state lives on the `data` branch, never on `main`; `main` stays owned by the Claude task.
- Secrets never in git: `sydney/pipeline/credentials.py`, `sydney/pipeline/pull_nsw.js`, `fuel-api-credentials.md` are gitignored.

## Open risks
- AIP / FRED worked from GitHub runners on the first run; both stay best-effort (model forward-fills, `meta.warnings` flags staleness).
- GitHub cron can start 10–30 min late; scheduled workflows pause after 60 days of no repo activity (daily `data` commits count).
- NSW FuelCheck licence terms matter only if the app goes public.
