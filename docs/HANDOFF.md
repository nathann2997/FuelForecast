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
- [ ] Go-live: [x] QA audit + fixes → [x] commits (local) → [x] repo secrets → [x] Pages enabled (build_type=workflow) → [ ] push (blocked: `gh` token lacks `workflow` scope; owner runs `gh auth refresh -h github.com -s workflow`) → [ ] first manual run (`gh workflow run daily-forecast`) → [ ] verify `data` branch + Pages URL
- [ ] Phase 3 — Expo app in `/app`: tabs Today / Stations / History / About; expo-router, @tanstack/react-query (offline cache), expo-location, victory-native, AsyncStorage; haversine on device; stale banner from `meta.asof`
- [ ] Phase 4 — EAS Build preview APK, EAS Update, CI typecheck/lint for `/app`

## Key facts
- API base: `https://nathann2997.github.io/FuelForecast/api/v1/` (see `sydney/README.md` for the file schema).
- `stations.json` per-fuel tuple: `[price, days since update, advice code, advice label, reason]`; advice codes: now, by, ok, wait, hi, any, chk.
- Verdict rule lives in `template.html` (`verdict()`) and is mirrored in `export_api.py` — change both together.
- Workflow state lives on the `data` branch, never on `main`; `main` stays owned by the Claude task.
- Secrets never in git: `sydney/pipeline/credentials.py`, `sydney/pipeline/pull_nsw.js`, `fuel-api-credentials.md` are gitignored.

## Open risks
- AIP / FRED could block GitHub runner IPs; both are best-effort (model forward-fills).
- GitHub cron can start 10–30 min late; scheduled workflows pause after 60 days of no repo activity (daily `data` commits count).
- NSW FuelCheck licence terms matter only if the app goes public.
