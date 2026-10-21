# Changelog

All notable changes to the FuelForecast pipeline and app. Newest first.

## 2026-10-22 — Bowser 0.6.0 (in progress): owner's feedback round

### iOS build (new; see `docs/IOS.md`)
- **Bowser now builds for iPhone.** EAS iOS simulator build 46497e9c compiled and contains the WidgetKit extension: https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/46497e9c-bfac-45fb-90ec-33b53c98d856
  - The JS layout fixes below came after that build.
  - Installing on a real iPhone needs an Apple Developer Program account (TestFlight recommended).
- **iOS home-screen and lock-screen widget** (`expo-widgets` + `@expo/ui` SwiftUI, `widget/ios-widget.tsx`): one `BowserWidget` in small, medium, large, lock-screen rectangular and inline sizes.
  - Small: the call, the rise line, and your cheapest station.
  - Medium and large: 3 or 6 pinned or cheapest-nearby stations. Each row opens its station.
  - Built from the shared `buildModel` via `widget/ios-model.ts`.
- **Widget timeline** (`widget/render.ios.ts`): the app pushes it when data, pins, fuel or area change.
  - Entries at the next 7 Sydney midnights keep "rise from tomorrow" and "as of" right while Bowser is closed (DST-safe `sydneyMidnight`).
- **Background refresh on iOS** (`widget/register.ios.ts`, `expo-background-task`): fetches the API, pushes the widget and keeps the rise alert current while Bowser is closed. It runs every 4 h at most, when iOS allows.
- `widget/sync.ts` keeps the widget in step on iOS as well as Android. The welcome screen's widget tip has iOS steps.
- **Config:**
  - Version 0.6.0 (runtime 0.6.0 on both platforms).
  - `ios.supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`.
  - EAS `simulator` profile; `production` auto-increments the build number.
- **The Android APK is unchanged by this.** The iOS-only native modules (`expo-widgets`, `@expo/ui`, `expo-background-task`, `expo-task-manager`, `unimodules-app-loader`) are excluded from Android autolinking in `app/package.json`.
- **QA audit, fixes applied:**
  - Excluded `unimodules-app-loader` from Android too. It's a transitive native dependency of task-manager and would have changed the APK.
  - Fitted the small, medium and large layouts to WidgetKit heights:
    - Small: 2-line headline, with "as of" in the header.
    - Medium and large: "as of" on the caption line, and a tighter row stack.
    - Large: capped at 6 rows.
  - Stale rows use the note's colour.
  - The timeline covers a week, not 2 days.
  - The lock-screen inline widget gets a tap URL and background.
  - Light-mode contrast on the medium widget's rise line.
  - Updated stale "no-op on iOS" comments.
- **Open:**
  - The expo-location "Always" usage string still appears on iOS, though iOS never asks for it. App Review may question it.
  - The iOS widget has no buttons (fuel or mode) yet.

### 1. Faster widget taps (native: needs the 0.6.0 APK)
All of this is in the widget library patch (`app/patches/react-native-android-widget+0.23.0.patch`).
- **Pinned/Nearest/Cheapest and fuel-chip taps skip WorkManager while Bowser is running.** If the app is open or was used recently, the tap's redraw starts at once. WorkManager's enqueue and job scheduling had been most of a warm tap's delay.
  - Only `MODE` and `FUEL` take this path; ⟳ (which can wait on GPS) still goes through WorkManager.
  - The receiver stays alive (`goAsync`) for at most 5 s.
- **The redraw shows sooner.** The theme the launcher is showing is drawn and pushed first, then the other theme.
  - Each theme is a full-size PNG plus one per list row, so the visible change no longer waits for the hidden half.
- **Station rows and the rest of the widget open Bowser directly.** They are now activity intents, which removes the hop through a broadcast and the widget receiver.
- **Remaining tap broadcasts go through Android's foreground queue** (`FLAG_RECEIVER_FOREGROUND`).
- **QA audit, fixes applied:**
  - The direct path is limited to redraw-only taps, with a 5 s hold (was 9 s for every click).
  - Dropped an early `ReactHost.start()` that could make a cold tap get lost.
  - List rows rebind after the second-theme pass.
  - The all-links check covers nested tap areas.

### 2. Widget fuel chip: step dots instead of a dropdown arrow (JS)
- **The arrow is gone.** "U91 ▾" looked like a dropdown, but a tap steps to the next fuel; there is no menu.
- **Step dots replace it.** The chip now shows the fuel and four dots, with this fuel's dot filled (U91 ● ○ ○ ○, E10 ○ ● ○ ○, …), a carousel cue for "one of four, tap for the next".
  - The dots are drawn as SVG in the chip's text colour (`FUEL_DOTS` and `fuelDotsW` in `widget/logic.ts`).
  - `chipW` counts their width, so the medium widget's headline and forecast lines still fit at 300 dp.
- **The compact small widget (under 150 dp) shows the plain pill**, since there is no room for the dots.
- **The in-app fuel button keeps its ▾**, because it really does open a picker.

### 3. No more "refresh" that doesn't refresh (JS)
- **The widget's ⟳ button is gone**, and so is its `LOCATE` action.
  - It only asked the phone for a new GPS fix, yet it looked like a data refresh, and the data itself only changes when the daily file is published.
  - The widget still follows your location from the last known position on its regular redraws (no GPS wake-ups).
  - A tap on a ⟳ still drawn by 0.5.0 redraws the widget without it (no location read, no fetch).
  - The mode tabs now use the full row.
  - Code removed: `canLocate` on the model, `LOCATE_ACTION`, and `currentFix` and its 8 s timeout in `widget/location.ts`.
- **The stale-data banner no longer says "pull down to refresh"**: "Showing prices from Tue 21 Oct. Today's update hasn't arrived yet."
- `docs/TESTING.md`'s widget-location check no longer mentions ⟳.

### 4. Fresher data: five pipeline runs a day (workflow + widget JS)
- **Review: NSW FuelCheck is live, so the old schedule was the bottleneck.** The API returns each station's current price, reported within minutes of a change.
  - **One run a day:** the pipeline ran once, at 06:30 Sydney.
  - **Often late:** GitHub cron often starts late; the scheduled run on 22 Oct started at 09:33.
  - **Stations change prices all day.** In the 2025–26 NSW history (319k hikes, 690k cuts, Sydney local time):

    | Share done by | Hikes | Cycle jumps (8c+) | Cuts |
    |---|---|---|---|
    | 06:00 | 7% | 7% | 4% |
    | 12:00 | 60% | 55% | 49% |
    | 18:00 | 90% | 89% | 88% |
    | 21:00 | 96% | 96% | 96% |

  - **So a 6:30 am snapshot showed almost none of a jump day.** It is really "yesterday's close", whereas the history rows the model trains on are each day's last price (`build_history.py`).
- **`.github/workflows/daily.yml` now runs five times a day** (AEDT; one hour earlier in AEST):

  | Time | Purpose |
  |---|---|
  | 05:13 | The day's first file, ready before the morning |
  | 10:13, 13:13, 17:13 | Catch the jumps |
  | 21:13 | The day's near-close (96% of changes in) |

  - **The latest run wins:** each run replaces the day's snapshot row (`update.py` already did this).
  - **Slot choice:** the slots avoid GitHub's busy :00/:30 marks and back each other up when one starts late.
  - **The close slot is 21:13, not later**, so even a late start stays on the same Sydney date.
  - **Old offset fixed:** a day's final row now matches the history's end-of-day definition. Before, a row labelled D was really D−1's close. One transition day will have a two-day `mom1`; it heals when the monthly history replaces the snapshot rows.
  - **Forecasts during the day use the day so far.** The 10:13, 13:13 and 17:13 runs build on a partial day, so the verdict and the jump odds can change during the day, and a rise alert can arrive mid-day. Alerts still go out at most once per cycle, with a 5-day cooldown.
- **The backtest now runs every 28 days, on whichever run comes first.** It was the first Monday of the month, which a late or failed run could skip for a month. `store/backtest_ran` on the `data` branch holds the date of the last one; the first run after this change does one.
- **The widget picks up runs during the day:**
  - Today's data counts as fresh for 2 h, not all day (`TODAY_FRESH_MS` in `widget/logic.ts`), so the 4-hourly widget update fetches the latest run.
  - The app's in-memory data is used only if it is today's, newer than the widget's cache and under 2 h old (`fromAppData` / `appDataUsable`).
  - Older app data never replaces the cache's copy of the same day. Before, a backgrounded app holding the morning's data would have frozen the widget at it.
- **The app needed no change.** Its 15-minute stale time and refetch-on-foreground already pick up new runs, and pull-to-refresh now really does bring newer prices during the day.
- **Load:**
  - Each run takes about 1.5 min on a free public-repo runner, plus a Pages deploy.
  - That's 2 NSW API calls per run, about 300 a month.
  - The `data` branch grows about 5x faster (one rewritten snapshot archive per run, about 160 MB a year).
- **QA audit, fixes applied:**
  - The app data's age is now checked (above).
  - The analysis hours are corrected.
  - The backtest is gated on how stale it is.
  - The close run moved from 22:43 to 21:13.

## 2026-10-22 — Bowser 0.5.0: best pick, welcome, swipe rows, rise alerts (new APK)

### Added
- **"Best for you" on Today.** The hero names the single cheapest fresh station among your pinned stations and the 3 cheapest nearby. It shows that station's advice and the saving against the Sydney average for your tank, and tapping it opens the station (`bestPick` in `lib/filters.ts`).
- **A welcome screen on first run** (`app/welcome.tsx`): fuel, area, rise alerts and a widget tip on one screen, with Start or Skip.
  - Settings saved before 0.5.0 that already have an area count as onboarded (`settings.onboarded`).
  - Today redirects to the welcome screen until it has been seen.
- **Swipe a station row left to Pin/Unpin or get Directions** (gesture-handler `ReanimatedSwipeable`).
  - The two icon buttons on every row are gone, which gives the name and price more room.
  - A small pin by the name marks a pinned station.
  - Screen readers get Pin and Directions as row actions, and the hidden swipe buttons are kept out of their reach.
  - Stations shows a one-line swipe hint until you pin something.
- **Rise alerts** (`expo-notifications`, `lib/alerts.ts`), opt-in from More or the welcome screen.
  - **When:** one local notification when a rise becomes likely, meaning the verdict says fill up or a jump is likely within 2 days. It's sent at the next 7:30 am, or a minute later if the widget finds it during the day.
  - **How often:** at most once per cycle, with a 5-day cooldown. The rise day moves forward with each day's forecast, so alerts key on the condition, not on a date.
  - **When it's cancelled:** if the rise is called off before the alert shows.
  - **When it's skipped:** if the app is open and already showing the warning.
  - **Where it's scheduled:** from the app, and from the widget's periodic update so it works while Bowser stays closed.
  - **Permissions:** if notifications are blocked in system settings, the switch turns itself off, and turning it back on offers Open Settings.
  - **Icon:** a dedicated, cropped notification icon (`assets/images/notification-icon.png`).
- **Trends opens a one-line cycle summary**, e.g. "Late in the cycle: 36 days since the last jump, so the next one is due." (`cycleSummary` in `lib/copy.ts`).
- **The small widget's bottom line names your cheapest station**, e.g. "229.3 · Enhance Merrylands", and tapping it opens that station. With old data, it falls back to the Sydney forecast line with "as of".

### Changed
- **Three tabs: Today, Stations, More.** Trends is now a page with a back button, opened from Today ("Price trends and the cycle →") and from More.
- `Screen` takes `onBack` and `stack`. Stack screens pad for the Android navigation bar.
- `station-actions.tsx` keeps only `notify` and `PINS_FULL`.
- Version 0.5.0. The runtime changes, so 0.4.0 installs don't get this by OTA and need the new APK.
- Preview APK: EAS build 9a04b5ad, https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/9a04b5ad-01dc-413b-b85e-91b7216a3c9c

### QA audit, fixes applied
- **Alerts rewritten as once per cycle.** Keying them on the rise date would have meant a new alert every day, or none at all.
- A pending alert that is cancelled is forgotten, so a later rise can still alert.
- Alerts notice when notifications are blocked.
- Stack screens get bottom insets.
- Screen readers no longer reach the hidden swipe buttons.
- Dedicated notification icon.
- The widget's best line is tappable, and its screen-reader label matches what's shown.
- `onboarded` is based on the validated area.

### Device checks
- **Welcome:** shown on a fresh install only, not on an upgrade with an area set.
- **Swipe rows:** check them inside the scrolling lists on Today and Stations.
- **Alerts:** turn them on (the Android 13+ permission prompt should appear) and check one arrives at 7:30 during a rise. Then turn off notifications in system settings and reopen Bowser: the switch should show off.
- **Small widget:** the bottom line taps through to the station.

## 2026-10-21 — Less text: a UX pass on the app and widget

### Changed
- **Rule for the pass:** one message per screen, a reason only where it helps, everything else behind a tap.
- **Today:**
  - The hero detail is one short line (`lib/outlook.ts`).
  - "Your stations" only shows once you've pinned something.
  - Dropped the station-dates note and the 80% band sentence.
  - The footer is now "Updated each morning. Estimates, not financial advice."
- **Stations:**
  - Removed the "likely to rise" banner, which repeated Today and the row chips, and the explanatory note line.
  - The count line now carries the radius and sort ("40 stations  within 5 km, cheapest first").
  - "About ‘Fill by’ dates" is one sentence.
- **Station rows, the station page and the widget:**
  - ALL-CAPS names are title-cased, keeping acronyms such as BP, EG and APW (`stationName` in `lib/format.ts`). Double spaces are collapsed.
  - The brand is dropped from "Brand · Suburb" when the name already contains it (`brandSuburb`).
- **Station page:**
  - The forecast card shows the advice chip and the rise line once, instead of three times.
  - Removed the range row under the tiles and the "Based on N jumps" footnote.
- **Trends:**
  - Insight cards are one line each.
  - The brand list shows 6 brands, with "Show all".
  - Shorter chart and history notes.
- **More:**
  - Removed the subtitle; "Tank size" is now a plain label.
  - The accuracy paragraph is three stat tiles (average 7-day error, right direction, error guessing no change).
  - Data freshness and sources are folded into "Data sources". Warnings still show outside it.
- **Widget:**
  - The caption is "Near <area>". It no longer repeats Cheapest or Nearest, which the mode row shows.
  - Pinned has no caption, and its rows get that room back (`mediumLayout(height, rows, hasCaption)`).

### QA audit, fixes applied
- Kept the rise date in the calm "higher in two weeks" line.
- An "act" verdict with a small 2-week move no longer repeats the deadline.
- "Day of week" says what is under 1c.
- The accuracy tiles drop "±", because it's a mean absolute error.
- Acronym allowlist instead of "keep words of 3 letters or fewer in capitals" (fixes "BP FOX Hills" and "Jack & CO"). Capitalisation after "(", "-" and "'".
- Forecast tile screen-reader labels match what's shown.
- The Costco members-only note is back on Trends.
- The calm-period qualifier is back on the cycle card.

## 2026-10-21 — More tab without the dashboard link; faster widget taps

### Removed
- **"Open the full web dashboard →"** link in More → About, and the unused `DASHBOARD_URL` constant (`app/src/lib/api.ts`).

### Changed
- **Widget taps (mode row, fuel chip, ⟳) do less work before redrawing** (`app/src/widget/register.android.ts`, `data.ts`):
  - The tapped mode or fuel is drawn first and saved to SQLite in parallel. The task still ends only after the save commits.
  - Location prep and the snapshot load run side by side instead of one after the other.
  - The cached snapshot (a few hundred KB of JSON) was parsed twice per tap. It's now parsed once and reused while the stored text is unchanged.
  - While the app is alive, the app's station data (~900 stations) was re-compacted on every redraw. That's now reused until the app refetches.
  - The old v1 cache key is removed once per run instead of on every cache write.
- Shipped as an OTA to the `preview` channel, runtime 0.4.0, update group 9b2d229c-6273-4763-b5d4-a9c39d1b9cde. No new APK needed.
- QA notes, accepted: a tap made within a few ms of another tap can briefly show the previous choice until the next redraw. A tap with an empty cache uses the backgrounded app's data, even if it's old, rather than fetching.

### Device checks
- Most of the delay left is native and isn't touched here. Each tap goes broadcast → WorkManager expedited job → headless JS task, and if Android has killed the app process, the JS runtime has to cold-start first. Time a tap with the app recently open against one after the app has been closed for a while.

## 2026-10-21 — New logo: the price-drop fuel drop (concept C)

### Changed
- **New Bowser mark:** an amber fuel drop with a down arrow cut out of it, concept C from `docs/brand/concepts.png`. It replaces the B-shaped pump with a hose (concept B, shipped up to 0.4.0), which read as "B1" at small sizes. The colours, the charcoal background and the drawn "Bowser" wordmark don't change.
- **All logo files were regenerated from one source:** the 5 SVGs in `app/assets/brand/`, the app icon, the adaptive foreground and background, the monochrome themed icon, the splash, the favicon and `widget-mark.png`. The new `docs/brand/render-brand.mjs` writes them all from the same path data as `brand.tsx`. The drop sits about 10% larger in the icons than the B did, so it carries the same visual weight.
- **`brand.tsx`:** the mark is now one even-odd path with an 82-unit viewBox. The lockup is 369×80, with the word centred on the taller mark. The home header goes from `height={22}` to `height={25}`, so the word stays the same size.
- **`docs/BRAND.md`:** a new mark section (geometry, the "download icon" caution and the do/don't rules) and new file sizes.
- An unreleased redraw (a B with window-and-drop counters) was explored the same day and dropped in favour of C.

### Device checks
- The launcher icon, adaptive icon and splash are native assets. They need a new build (0.4.x or 0.5.0) and don't arrive by OTA. The in-app header, the "More" tab mark and the bundled widget image ship with the JS bundle.
- Check the themed (monochrome) icon on Android 13+, and the widget mark in light and dark.

## 2026-10-21 — Bowser 0.4.0: the widget follows your location (new APK)

### Added
- **Live location in the widget.** If you've allowed location **all the time** and your area is "Use my location" (or unset), the widget lists Nearest/Cheapest around where the phone is now, not where you last opened Bowser.
  - Redraws read the phone's last known position (≤ 30 min old, ≤ 3 km accuracy) without waking the GPS.
  - The fix is stored on the phone as `widget.loc`, stamped with its own time and ignored after 6 h. It's deleted when permission is withdrawn or a suburb is typed.
  - A typed suburb always wins.
  - The widget never asks for permission itself, and no coordinates ever leave the phone (the API is static files).
- **⟳ button** in the medium widget's mode row, shown only when the widget may use location. It gets a fresh fix (Balanced accuracy, 8 s timeout, falls back to last known) and redraws.
- **More → Widget location** (Android only): a status line and an **Allow all the time** button. It asks for foreground then background permission; Android 11+ hands over to Settings, preceded by a "Next, choose Allow all the time" hint. When permission can't be asked again, the button opens Settings. When phone location is off, it opens Location settings. The widget redraws as soon as the permission changes.

### Changed (native)
- `version` 0.4.0. expo-location: `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: false` (ACCESS_BACKGROUND_LOCATION; no foreground service).
- **Widget tap fix:** `patches/react-native-android-widget+0.23.0.patch` (patch-package, applied on `postinstall`). Tap areas now get stable request codes `(widgetId << 10) | index` with `FLAG_UPDATE_CURRENT | FLAG_IMMUTABLE` instead of a clock-based code with `FLAG_CANCEL_CURRENT`. This fixes dead taps when areas are created in the same millisecond and a PendingIntent leak (upstream issue #154 / PR #161). List-item areas use 512+.
- The widget picker description now mentions pinned, nearest and cheapest stations with 7-day forecasts.

### QA audit: no blockers; 2 should-fix and 6 nice-to-have items fixed
- Approximate-only location users now get fixes (the accuracy limit was 1 km).
- Granting permission redraws the widget.
- The stored fix is cleared when unused and stamped with its measured time.
- Settings opens only when Android won't prompt.
- "Location is off on this phone" state; the Android 11+ hint.
- 305 tests.

### Not in this release
- A logo redraw from another session (window-and-drop B) is held back at the owner's request. It's kept uncommitted for a later decision.

### Device checks
- The patched Java compiles on EAS (it couldn't be compiled locally).
- Taps keep working after many redraws.
- Background last-known reads on Android 14+.
- ⟳ gets a fix indoors within 8 s.
- The permission flow through Settings and back.
- Google Play would require a background-location declaration if Bowser is ever published.

## 2026-10-21 — Widget: forecast price and "should I fuel up" (OTA to 0.3.0)

### Added
- **Two-line station rows** in the medium widget.
  - Left: the name, then the station's own advice in its tone colour ("Fill now", "Fill by Fri", "Wait"…). In Nearest mode the distance follows the advice.
  - Right: today's price, then the 7-day forecast "→ 237.4", which uses `stations.json` index 5. It's dear-coloured if 0.5c or more higher, cheap-coloured if 0.5c or more lower.
  - With no forecast (an old cache, or a day the station files failed), the right side shows the mode's note or nothing.
  - Compact widgets (under 166 dp) use one-line rows: the name, the advice with its width capped, and the price.
- **Header forecast:** the verdict and rise line stay, and a new line shows Sydney "237.9 now → 240.4 in 7 days" for the widget's fuel. It uses the longest form that fits. On the small widget the rise line shortens to "Rise from Sat" when needed.
- **Cache:** the key moved to `widget.cache.v2`, which carries the advice code and label plus the forecast. It reads `v1` as a fallback, so the first offline render after the update still shows data.

### Layout budgets (re-measured from the styles; all widget text has fixed size)
- Medium: compact 80, regular 122, caption +18.
- Row height: 44 dp for two-line rows, 28 dp for one-line rows.
- Medium is compact below 166 dp.
- Small: compact below 150 dp (measures 107), regular measures 144.
- The list is still never drawn smaller than one row; the plain-row fallback stays.

### QA audit: no blockers; 2 should-fix and 4 nice-to-have items fixed
- Old-cache fallback; no distance in compact rows; advice is no longer repeated; taller two-line rows; short rise wording; a clearer comment. 281 tests in total.

### Device checks
- Compact row alignment.
- Two-line rows on OEM fonts.
- The "→" glyph and colours in light and dark.

## 2026-10-21 — API: 7-day station forecast in stations.json

- `stations.json` fuel tuples gain index 5: the station's 7-day forecast price, `round(fc.now + fc.d7, 1)`, taken from the same forecast as `station/{id}.json`. It's for the widget, which can't fetch per-station files.
- It's added inside the fail-soft station block, so on a day the station files fail the tuples stay at 5 items. `SCHEMA` stays 1 (an additive change), and `types.ts` `StationPrice` gains an optional 6th item.
- QA: no blockers.
  - The dashboard, `forecast.json`, `history.json` and all station files are byte-identical to before.
  - `stations.json` differs only by index 5. It's +15 KB raw and +6 KB gzipped.
  - The installed app reads tuples by index, so it ignores the extra item.
  - A forced failure leaves 5-item tuples and exits 0.

## 2026-10-21 — Widget: scrollable station list and per-widget fuel chip (OTA to 0.3.0)

### Added
- **Scrollable station list** in the medium widget (the library's `ListWidget`). It shows every pinned station (up to 10), and up to 10 in Nearest and Cheapest.
  - Android widgets can't animate or auto-scroll, so the list scrolls by finger.
  - The header and the mode row stay fixed above it.
- Station taps in the list go through the list's shared fill-in intent, not the per-area timestamp PendingIntent, so they avoid the library's tap-collision issue. Nothing tappable is nested inside an item.
- **Fuel chip** ("U91 ▾") on both sizes. Tapping cycles U91 → E10 → P98 → Diesel for that widget only.
  - Stored per widget under kv `widget.fuel.<id>`, and cleared when the widget is removed or set back to the app's fuel.
  - The verdict, rise date, median gaps, rows, messages and default mode all follow the widget's fuel.
  - The header says "No outlook for {fuel}" when the forecast has no row for it.

### QA audit: 1 blocker, fixed; re-verified safe to ship
- **Blocker:** on a short widget (landscape minimum height, large fonts) the list could measure 0 dp high. The library's native "ListWidget width and height must be > 0" exception, or a zero-height item bitmap, would then blank the widget after JS had finished.
- **Fix:**
  - Header and row text no longer scale with the system font.
  - The fixed block above the list is budgeted from the styles: compact 80 dp (measures 78), regular 112 (measures 108), caption +18.
  - The list gets a numeric height of min(room, rows × 28) and is drawn only when that is ≥ 28 dp. Otherwise one static station row is shown.
  - A short list leaves the space below it tappable ("open Today").
- Render tests cover heights 0–220 dp for every mode, fuel and data state. 188 tests in total.

### Device checks
- Landscape at the minimum size with a large display size: check that the fallback row shows.
- Station taps from the list on Android 14+.
- Chip and tab taps after many redraws (library issue #154 still applies to areas outside the list).

## 2026-10-21 — Widget: Pinned · Nearest · Cheapest (OTA to 0.3.0)

### Added
- The medium widget has a tappable mode row: **Pinned · Nearest · Cheapest**.
  - Each placed widget keeps its own mode, stored under kv `widget.mode.<widgetId>` and cleared when the widget is removed.
  - Pinned shows your pins in pin order.
  - Nearest shows fresh stations (≤7 days) within the radius, closest first, with the distance.
  - Cheapest shows fresh stations within the radius, cheapest first, with the gap to the median.
  - All modes respect the members-only setting.
- Default mode: Pinned when at least one pin has a price for your fuel, otherwise Cheapest. Existing widgets therefore behave as before until you tap a tab.
- How a tab tap works: the custom click action `MODE` runs the headless task, which saves the mode and redraws that widget from the cache, fetching only if there's no cache. The in-app refresh draws each widget in its own mode.
- At the compact 110 dp size the header is one line ("as of" joins the headline) and the tab labels don't scale with system font size.
- New `src/widget/model.ts`. Tests: mode logic, every mode built through the library's tree builder, and a handler test (`widget-handler.test.ts`). 110 tests in total.

### QA audit: no blockers; 4 should-fix items fixed
- A tap draws the tapped mode even if saving it fails.
- A tap on a widget with no cache now loads data.
- The default no longer strands users whose pins don't sell their fuel.
- Handler tests added.

### Risks (device)
- Up to 7 tap areas per widget. The library gives each tap PendingIntent a millisecond-timestamp request code with `FLAG_CANCEL_CURRENT` (`RNWidget.java:208-213`), so two areas created in the same millisecond can cancel one another. Issue #154 (taps stop working after redraws) also applies.
- If any tab or row stops responding, the fix is a native patch (unique request codes / PR #161), which needs a new APK (0.4.0).
- `app.json`'s BowserMedium picker description is out of date; update it at the next native build.

## 2026-10-21 — Fix: blank home-screen widget (OTA to 0.3.0)

On a device the widget was transparent and only opened the app when tapped.

### Cause
- `app.json` has `experiments.reactCompiler: true`. The React Compiler rewrote the widget components (`src/widget/widgets.tsx`) to use React's memo-cache hook.
- `react-native-android-widget` builds widgets by calling components as plain functions outside React. The hook therefore threw "Invalid hook call", the headless task failed before its first draw, and the in-app refresh failed silently too.
- Web, jest and `expo export` don't run that code path, so the earlier checks couldn't catch it.

### Fixed
- `'use no memo'` in `src/widget/widgets.tsx`, which is the library's documented opt-out.
- The widget task always draws: from the cache if a fetch throws, otherwise the "Open Bowser" prompt. It no longer leaves a never-drawn widget transparent.
- Render and refresh failures are now logged with `console.error`, so they show in `adb logcat`.
- Regression test `src/lib/__tests__/widget-render.test.ts` compiles `widgets.tsx` the way Metro does with the React Compiler and asserts no compiler runtime. It also builds both widgets through the library's `buildWidgetTree`. The test fails if the directive is removed.
- Jest maps `@/assets/*` to `assets/`, matching `tsconfig`.

QA audited, with no blockers. Shipped as an OTA update on channel `preview` (JS only; runtime 0.3.0). Testers open Bowser, close it fully and reopen it, and the widget then redraws. Any new widget component file needs `'use no memo'` too.

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

### Released (2026-10-21)
- Pushed `2957ac5`. Daily workflow run 39538872516 passed: 866/866 stations have `id`, the `station/` files are live, and there are no warnings.
- Preview APK 0.3.0 is EAS build `69314a1c` (install page: https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/69314a1c-e1ff-4421-9f09-a208bb7a5ff0).

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
