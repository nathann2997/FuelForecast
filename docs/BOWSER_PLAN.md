# Bowser — rebrand and v0.3 feature plan (2026-10-21)

Product owner: Nathan. PM: Claude. This is the single source of truth for this release; briefs to the designer and engineers point here.

## 1. Rebrand: "Sydney Fuel Outlook" → **Bowser**
- The name is **Bowser**. It has no subtitle and no tagline anywhere: not in the launcher label, the splash, the headers or the store copy.
- User-visible surfaces change: the launcher name (`app.json` `name`), the icon, adaptive icon and monochrome icon, the splash, the favicon, the in-app wordmark, the More/About copy, the widget, `app/README.md` and `docs/TESTING.md`.
- **Technical identifiers stay** (deliberately): Android package `com.nathann2997.fuelforecast`, iOS bundle id, Expo slug `fuel-forecast`, the EAS project, URL scheme `fuelforecast`, the GitHub repo and the API URL `…/FuelForecast/api/v1`. Changing these would orphan the installed tester APKs, break OTA updates and move the API. Users never see them.
- The web dashboard (`sydney/pipeline/template.html`, "Sydney Pump Outlook") is owned by the Claude scheduled task. It stays untouched in this release.
- The new launcher name and icon need a new APK. OTA updates can't change them. Native code for the widget forces a new build anyway, so `version` moves to **0.3.0** (the runtime policy is `appVersion`, so 0.1.0 installs won't receive 0.3.0 OTA bundles that need the widget's native code).

## 2. Features

### F1 — Pin stations
- Tap a pin icon on any station row or on the station page to pin or unpin it. You can pin up to 10 stations, and they are stored on the phone (`lib/pins.ts`, keyed by the NSW station code `id`).
- **Today**: a "Your stations" section sits above "Best near you". It shows each pinned station's price for your fuel, its gap to the median and its advice chip. It is empty until you pin something; until then a one-line hint explains how to pin.
- **Stations**: pinned stations are listed first, in a "Pinned" group, whatever the radius. They still respect the fuel choice.
- Tapping the pin when the list is full shows a short message ("You can pin up to 10 stations").

### F2 — Filter stations
- A **Filters** button with a count of active filters opens a sheet. The sheet holds:
  - Sort: Cheapest / Nearest (moved here from the chips)
  - Radius: 2 / 5 / 10 / 20 km
  - Brands: multi-select, built from today's data, most common first, with a search box once the list is long
  - When to fill: Fill now / Fill by… / Wait / No rush or Any time (multi-select on advice codes)
  - Max price (c/L), optional
  - Members-only sites on or off; show prices older than 7 days on or off; pinned only
- Filters persist in settings. A "Reset" in the sheet clears them, and the list header reads "N stations · M filters".
- An empty result shows "No stations match. Reset filters".

### F3 — One-tap directions
- Every station row has a visible **Directions** icon button, so you no longer have to expand the row first. The station page has a full Directions button.
- It opens Google Maps driving directions on Android (`google.navigation:q=lat,lon`, falling back to the maps `dir` URL) and Apple Maps on iOS.
- The tap target is at least 44 dp and is separate from the row's own tap target.

### F4 — Station page ("ticker" page) — route `/station/[id]`
- **Tapping a row now opens this page** instead of expanding the row.
- **Header**: the station name, brand · suburb · distance, a pin toggle and a Directions button.
- **Ticker block** for the selected fuel (a segmented control lists only the fuels this station sells):
  - Big current price, and the change since yesterday and over 7 days in c/L and %, coloured like a stock (down = good = cheap colour)
  - Its gap to today's Sydney median, and when the price was last updated
- **Chart**: the station's daily price line with the Sydney median as a faint dashed comparison line. Range tabs are **1W · 1M · 3M · 6M · 1Y**. Drag to scrub, with the date and price shown at the finger. The forecast continues the line as a dotted path with a shaded likely range for 14 days, and a vertical "today" divider separates history from forecast.
- **Stats row** for the selected range: low, high, average vs the median, and the number of price jumps.
- **Forecast for this station**: the advice chip and reason, "Likely to rise from Sat 24 Oct" (or "No rise expected in 14 days"), 1 / 3 / 7 / 14-day price tiles with ranges, and the dollar effect on your tank.
- **How this station behaves**: its usual premium vs the median, how fast it follows price jumps ("usually rises about 1 day after most of Sydney") and how often it joins them ("joins 9 in 10 jumps" / "steady pricer").
- **States**: loading skeleton; offline with cached data (show the cached date); a station with no history yet (forecast only); a fuel with no history.

### F5 — Android home-screen widget
- **Small (2×2)**: Bowser mark, today's verdict for your fuel ("Fill up this week") and the rise date.
- **Medium (4×2)**: the verdict line plus up to 3 pinned stations (price, gap or advice chip). With no pins, it shows the 3 cheapest fresh stations near your saved area. With no area either, it shows a prompt to open the app.
- Tapping a station opens `/station/[id]`; tapping anywhere else opens Today.
- **Refresh**: when the app fetches new data, when pins, fuel or area change, and periodically (data changes once a day, so every 3–6 h is plenty). Show "as of" when the data is older than today.
- Follows the light or dark system theme. Uses the Bowser icon.

## 3. Data: per-station API (blocks F4 and the widget's forecasts)
- `stations.json` gains `id` (the NSW station code as a string) on every station. No schema bump is needed: the field is additive.
- New `station/{id}.json` per station follows the `StationDetail` type in `app/src/lib/types.ts` (the contract; keep the two in step):
  - `hist`: end-of-day price per fuel per day for the last 400 days (null = unknown). It is built from the NSW monthly price-change history (`store/events`), forward-filled between changes, then overlaid with the daily station snapshots (`archive/`) for days the monthly files don't cover yet.
  - `profile`: from `store/station_profile.json` (`typ`, `lag`, `part`, `n`).
  - `fc`: the station forecast per fuel. It is derived from the Sydney forecast path for that fuel and anchored at this station's current price, shifted by the station's lag (the same shift `advise()` in `build.py` uses) and damped by its participation. The ranges come from the Sydney lo/hi. `adv` matches `stations.json`, and `rise` is the date the advice is based on.
- These are generated in `export_api.py` (the app path). Do not change `build.py`'s behaviour, the Claude task, or `main`'s `store/`.

## 4. Who does what (file ownership, so parallel work doesn't collide)
| Workstream | Owner | Owns |
|---|---|---|
| Brand identity | Designer | `app/assets/brand/**` (new), replacement images in `app/assets/images/`, `app/src/components/brand.tsx` (new), `docs/BRAND.md` (new) |
| Station API | Data engineer | `sydney/pipeline/export_api.py`, `sydney/pipeline/station_api.py` (new), `sydney/README.md`, `.github/workflows/daily.yml` (only if needed) |
| Stations, pins, filters, directions, Today pins | App engineer A | `src/app/(tabs)/*.tsx`, `src/components/station-row.tsx`, `area-picker.tsx`, `ui.tsx`, new `filter-sheet.tsx`, `src/lib/settings.ts`, `geo.ts`, `copy.ts`, `outlook.ts`, `location.ts`, new `lib/directions.ts` |
| Station page | App engineer B | `src/app/station/[id].tsx` (new), `src/components/ticker-chart.tsx` (new), `src/lib/station.ts` (new) and its tests, `src/app/_layout.tsx` (Stack screen options only) |
| Widget | App engineer C | `src/widget/**` (new), `index.ts` entry if needed, `package.json` deps, `app.json` `plugins` entry for the widget |
| Integration, rebrand config and docs, QA, release | PM | `app.json` (name, version, icons, splash), `README`/`TESTING`/`HANDOFF`/`CHANGELOG` |

The shared contracts were written by the PM before the work split: `lib/types.ts` (`Station.id`, `StationDetail`), `lib/api.ts` (`useStationDetail`), `lib/pins.ts` (pins store with `onPinsChange` for the widget), and the routing (root Stack + `(tabs)` group). Change a contract only by agreement, and note it in your report.

## 5. Definition of done
- `cd app && npx tsc --noEmit && npx expo lint && npx jest` pass, and new logic has unit tests.
- The web preview renders every changed screen at phone width (500 px) in light and dark.
- The pipeline export runs on a scratch copy and its output passes sanity checks. The per-station files' total size is reported.
- A QA agent audit is complete with findings fixed before commit. `CHANGELOG.md` and `docs/HANDOFF.md` are updated.
- Release: a new preview APK (0.3.0) from EAS, run only after the owner OKs it.

## 6. Out of scope for this release
Maps view, accounts, push notifications, iOS widget, areas outside Sydney, and changes to the web dashboard.
