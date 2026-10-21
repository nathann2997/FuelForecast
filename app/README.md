# Sydney Fuel Outlook (Android POC)

Expo / React Native app for the Sydney pump price forecast. It reads the static JSON API published daily by `.github/workflows/daily.yml` (`https://nathann2997.github.io/FuelForecast/api/v1/`) and shows the same numbers and wording as the web dashboard.

| Tab | What |
|---|---|
| Today | "Fill up now or wait" verdict per fuel, the why, 1/3/7/14-day outlook with 80% ranges, 7-day jump risk |
| Stations | Cheapest stations today; near me (GPS) or suburb/postcode search, 2–20 km radius, cheapest or nearest first, members-only toggle, per-station "when to fill"; tap for Google Maps directions |
| History | Median vs wholesale chart with cheapest-to-dearest band and forecast fan (3M/1Y/3Y/All, drag to inspect), cycle insights, brand premiums |
| About | Model card, backtest accuracy, data freshness, sources |

Data is cached on the device for offline use; a banner shows when the data on screen isn't today's.

## Run it
Node 22+ (installed at `~/.local/node`; `~/.zshrc` adds it to `PATH`).
```sh
cd app
npm install
npx expo start          # scan the QR code with Expo Go on Android
```

## Checks
```sh
npx tsc --noEmit && npx expo lint && npx jest && npx expo-doctor
```
`.github/workflows/app-ci.yml` runs the same on every push/PR touching `app/`.

## Build an APK for testers
Needs a free Expo account (first run is interactive: links the project and creates the Android keystore).
```sh
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview   # gives an install link for the APK
```

## Layout
- `src/app/` screens (expo-router; `_layout.tsx` sets up the query cache and tabs)
- `src/lib/` API types and fetch hooks, settings, and pure logic ported from the dashboard (`copy.ts`, `geo.ts`, `chart.ts`); tests in `src/lib/__tests__/`
- `src/components/` UI kit, tabs, chart
- `*.web.tsx` / `*.web.ts` exist only for a browser preview

Keep `src/lib/copy.ts` and `src/lib/types.ts` in step with `sydney/pipeline/template.html` and `sydney/pipeline/export_api.py`.
