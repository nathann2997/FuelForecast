# Changelog

All notable changes to the FuelForecast pipeline and app. Newest first.

## 2026-10-27 — Premium 95 (P95) as a fifth fuel (pipeline + app JS, runtime 0.8.0)

A user asked for E85 and 95. NSW FuelCheck carries both. **P95 is built in full; E85 is not added.** E85 has 17 Sydney stations, below the 20-station floor in `build_history.py`; it has 1–57 price changes a month, and only 4 of 17 stations moved over 13–27 Oct. Its Sydney median is about 23c above U91.
- **Data:**
  - **History:** P95 history from Jan 2019 was already in the yearly extracts. The Aug/Sep 2026 monthly extracts had filtered it out, so they were pulled again from data.nsw.gov.au. The other fuels are unchanged: the only differences are about 70 one-minute timestamp roundings per month, and `daily.csv` rows are identical.
  - **Snapshot days:** 13–27 Oct are backfilled from `archive/`.
  - **Gap:** 1–12 Oct is missing for every fuel until NSW publishes October.
- **Pipeline:**
  - **One fuel list:** `sydney/pipeline/fuels.py` (`U91, E10, P95, P98, DL`), imported by every script. The JS, HTML and app copies are listed in its docstring.
  - **Self-healing backfill, so the `data` branch fills itself on its next run:**
    - `fetch.py` `lacks_fuel` re-pulls a stored monthly file from the last three months that lacks a tracked fuel. `run_daily.sh` then rebuilds the history.
    - `update.py` adds the missing fuel's rows for archived snapshot days after the published history (`snapshot_rows()` is factored out for this).
  - **Other changes:** `p95_prem` stat. The dashboard and share page list P95. The dashboard explains P95 the way it explains P98. Its accuracy table says "hasn't been through the monthly accuracy test yet" for a fuel the backtest lacks.
- **Model (walk-forward backtest, Jan 2021 – Oct 2026):**
  - **P95:** 7-day average miss 5.45c vs 11.67c for "no change" (53% better; P98 55%). Direction 87% (P98 86%). Jump AUC 0.937 (P98 0.935). Replayed calls right 79% (1,653 / 2,095). It's shown with the same verdict rule as the other fuels.
  - **Cost to the other fuels:** the shared model now also trains on P95. Against a 4-fuel run on the same data with another seed, 7-day error is +1.0–2.0% for U91/E10/P98/DL, about 0.1c. The seed alone moves it ±0.7%. The 14-day change is within noise. Option if that matters: a separate model for P95.
- **App (JS only, so an OTA at runtime 0.8.0):**
  - **Fuel lists:** P95 is in the fuel type, the labels, settings, fills, savings, the station page and the widget fuel cycle.
  - **Widget step dots:** there are now five. The dots are 3.5 dp with 1.5 dp gaps, which keeps the chip at its old 23.5 dp, so no widget line loses text.
  - **Copy:** "E10 and Premium" gains P95, and the model text says five fuels.
  - **Partial types:** `history.hist`, `track.live` and `replay`, and `bt.auc` are `Partial`. A fuel the published API or a phone's cache doesn't carry yet is guarded:
    - The chart falls back to empty series.
    - The backtest table has no rows, and the note says it isn't tested yet.
    - More shows the note instead of a spinner that never ends.
  - **Older builds:** checked. They ignore P95, because every lookup is keyed on the user's own fuel or a hardcoded 4-fuel list.
- **QA audit** (subagent): no crashes in old or new builds. Findings fixed:
  - The dashboard and More threw or spun for P95 until the `data` branch backtest reruns.
  - The chart ignored the range with no history.
  - Leftover "four fuels" text.
  - An unclosed gzip read.
  - The fuels.py docstring list.
- **Checks:** health tests 24 OK. App tsc, lint and jest 410/410. Local `export_api.py` passes with no warnings. Headless dashboard test with P95 missing from the backtest.
- **Rollout order:**
  1. Push `main`.
  2. Right away, run `gh workflow run daily.yml -f backtest=true`. Until then, data-health reports "P95 missing" (critical) and remediate reruns on its own budget.
  3. Then the OTA. A new build on the old API would spin on Today and Trends for a P95 user.
- **Device checks:** the five-label fuel picker at large font scale on a 360 dp phone, the 3.5 dp widget dots, and P95 on Today, Stations, the map, the station page and the widget.

## 2026-10-26 — Map rework after the first device test (JS only, runtime 0.8.0)

The owner's first look at 0.8.0 (dark mode, P98) raised four problems. Two big blue dots looked like location markers, most stations seemed missing, and "Search this area" felt slow. The design also didn't match the app.
- **The blue dots were clusters with no number:**
  - Bubbles had `tracksViewChanges={false}` from the first paint, so Android captured them before the count text drew.
  - With supercluster's radius at 120 (about 60 dp), roughly 50 of the 59 stations were hidden in two blank bubbles.
  - **Fix:** a `useTracking` hook gives every marker (tags, clusters, the "you" dot) a 500 ms redraw window whenever its look changes.
  - Clusters now use the app's primary colours (dark on light, light on dark), so they can't be taken for the blue "you" dot.
  - Clustering is lighter (radius 60, about 30 dp, so only overlapping tags merge), and it stops at zoom 13, so every station has its own tag from suburb zoom in.
- **Stations load as you pan:**
  - "Search this area", the radius circle and the searched-area state are gone.
  - The map holds every station for the fuel that passes the filters (826 for P98, 77 of them hidden as more than 7 days old, as in the list). It shows the ones in view after each pan or zoom.
  - The radius now only sets how far the map shows when it opens. The ◎ button goes back there.
  - Colours are the cheapest, middle and dearest third **of the stations in view**, and the card says "One of the cheapest in view".
  - The header reads "N stations in view".
- **Matches the app:**
  - The map has the list's header: the refresh line, "Stations", the fuel chip, then the area bar with "Change" and a filter button. Switching views no longer moves the top of the screen.
  - The Map/List button uses the primary button colours, not blue.
  - The station card is compact and sits over the bottom of the map like the app's sheets: name, price, the fill-up chip and "7 days: ~X" on one line, then Directions, Pin and Details. The reason text lives on the station page.
  - While the card is open, the map's bottom padding equals the card's height, so the Google logo and the centred tag stay above it. The toggle and the locate button hide.
  - The re-centre button has a proper "my location" icon and a visible border in dark mode.
  - Tags have 10 dp corners. Selection is a thick outline, and pinned tags are marked by their pin icon.
- **QA audit, round 2** (subagent, read against the react-native-maps Android source):
  - **Colours not refreshing:** Android only redraws a marker's picture when it's added or resized. `tracksViewChanges` doesn't redraw on a colour-only change (MarkerManager/MapMarker.java). So a tag would keep its old colour or price after a pan, a refresh or a theme switch. Tags, clusters and the "you" dot are now keyed by their look and come back as new markers, tracked for 500 ms after mount. This also applies the z-order, which Android only reads when a marker is created.
  - **Docked card:** it left a 10–130 dp map on a 360×640 phone. That's replaced by the overlay card and padding described above.
  - **Clusters failing to split:** Android fits `animateToRegion` by the limiting span. Tapping now uses `animateCamera` with a real zoom on Android (span on iOS), and the clustering zoom accounts for the map's width (`zoomOf(region, widthDp)`).
  - **Tags popping in and out:** tags load 15% past each edge, and 40% past the bottom (`padBox`), so they don't pop in at the edges. The count still uses the exact view.
  - **Colours shifting on every nudge:** they now recompute only after a real move (most of a zoom level, or a third of the screen), never on the tap's own re-centring.
  - **Selection reappearing:** a selection that leaves the map is cleared, so it doesn't pop back.
  - **Filter button:** on the map it reads "Show on map", not a whole-Sydney count.
  - **Pinned tags:** the dark outline is back, and they sit on top again.
  - **Dark-mode contrast:** green and red tags use dark price text in dark mode, because white text was about 2.3:1.
- **Removed:** `offerSearch`, `areaRows` and the `map.searched` event. Added `inBox`, `padBox`, `lonSpanAt` and `mapStations`. Tests: 410 pass. Android and web bundles export.
- **Not yet seen on a device.**

## 2026-10-26 — Bowser 0.8.0: Stations map (native build, not pushed)

The owner asked for a map view toggled by one button, as in 18 Birdies, that looks like NSW FuelCheck. They approved Google Maps "if it's free" and all five suggested extras.
- **Map source:** Google Maps through `react-native-maps` 1.29.11. It uses Google on Android and Apple Maps on iOS, which needs no key.
  - Google's price list (checked 2026-10-26; usage page updated 2026-10-23) shows the "Maps SDK" SKU as **Unlimited**, with no charge.
  - A billing account is still required.
  - The rejected alternative was MapLibre + OpenFreeMap. It's free with no key, but best-effort and donation-funded.
- **Toggle:** a floating blue "Map" button on Stations. On the map it changes to "List".
- **Map:**
  - It uses the same fuel, filters, discounts, radius and members rule as the list. The radius is drawn as a circle.
  - Each station is a price tag with a short brand label. There are no brand logos, because the repo has no logo assets.
  - When zoomed out, stations merge into numbered circles (supercluster); tapping one zooms in.
  - Google's business places are hidden so its own petrol icons don't sit under the tags.
  - A dark map style follows the phone's theme.
- **The five extras:**
  1. **Colour-coded tags:** green for the cheapest third of the stations in the area, amber for the middle third, red for the dearest third. With fewer than 3 stations or less than 1c spread, all tags are amber. A "Cheaper ● ● ● Dearer" legend sits in the header.
  2. **Forecast on the card:** tapping a tag opens a card with the price and the gap to the median. It also shows the when-to-fill chip with its reason, "In 7 days: about X", and "One of the cheapest here" where it applies. Buttons: Directions, Pin/Unpin, Details.
  3. **Pinned stations:** shown whatever the radius and filters, as in the list, with a dark outline and a pin icon. They are coloured against the area.
  4. **Search this area:** appears once the map has moved a quarter of the radius (at least 1 km) away. It re-centres the radius there. This is map-only state: the saved area, Today, the list and the widget don't change. "‹ Back to near you" and the ◎ button return.
  5. **Remember the view:** a new `settings.view` (`list` by default). Stations reopens on whichever view was used last.
- **Privacy:**
  - The map's own location layer (`showsUserLocation`) is off. The blue "you" dot is drawn from Bowser's existing fix, so the map library never reads the phone's position.
  - The map provider does see the area on screen, because it serves those map tiles. The location permission text now says so: "Bowser never sends it anywhere. The map provider sees the area you're viewing, as with any map." The old wording ("never leaves your phone") was too strong once a map is on screen.
  - The "you" dot is hidden while the phone can't locate. The map header says "last known", as the list does.
  - A new analytics event, `map.searched`, records that a search happened, never the place.
- **Key handling:**
  - `app.config.js` reads `GOOGLE_MAPS_ANDROID_API_KEY` (an EAS env var, never committed) into `android.config.googleMaps.apiKey`.
  - Expo strips `android.config` from the public config, so OTA manifests don't carry the key. The APK's own manifest does, as every Maps app's must, which is why the key is restricted to this package and signing SHA-1.
  - An Android EAS build without the key fails at config time, rather than shipping a blank grey map.
  - No runtime flag is used, so an OTA update can't hide or show the map. iOS needs no key.
  - The web preview never shows the button (`station-map.web.tsx` stub).
- **Version:** 0.8.0, because there's a new native module (runtime `appVersion`). The map JS can't reach 0.7.0 phones.
- **Files:**
  - New: `app/app.config.js`, `src/lib/map.ts`, `src/components/station-map.tsx` and `.web.tsx`, `src/lib/__tests__/map.test.ts`.
  - Changed: `(tabs)/stations.tsx`, `icons.tsx` (Map/List icons), `settings.ts`, `analytics.ts`, `app.json`, and `package.json`. In `package.json`, Jest now transforms `supercluster|kdbush`, which ship as ES modules.
- **QA audit** (subagent; 11 findings, fixed except the open items listed below):
  - **Key handling:** the key leaked into the public config through the react-native-maps plugin props, and an OTA update could flip `mapsReady`. Both are replaced as described above.
  - **Search state:** a new suburb, or a real move (`areaMoved`: more than a quarter of the radius, at least 1 km), clears a search. A GPS re-read a few hundred metres on does not.
  - **Following the area:** the map no longer snaps back on every GPS re-read. It follows only a real move (more than a quarter of the radius, at least 1 km) or a radius change.
  - **Clusters:** tapping one zooms half a level past its split point, so it can't get stuck. Their keys include the count and colour, because Android keeps a marker's first picture.
  - **Selected tag:** selection is a blue border, not a scale that Android clips.
  - **Map header:** Filters is an icon with a count badge, and the radius moved to the second row, so the place name fits at 360 dp.
  - **Location:** the "you" dot and the "last known" wording follow the location state.
  - **Map padding:** it's fixed, because changing it moved the camera.
  - **Tapping a tag:** a tag in the lower half moves up clear of the card.
  - **Cluster size:** the cluster radius now matches a tag's width (about 60 dp).
  - **Re-renders:** the tag-tap handler is stable, so the memoised tags don't re-render on every pan.
- **Known, open:**
  - With no area set, "Search this area" narrows all stations down to one radius.
  - Unpinning a station outside the area from its card closes the card.
  - The fixed bottom map padding (80 dp) means an open card probably covers the Google logo. Google's terms don't allow obscuring it, so check on a device. If it's covered, set a constant padding of about the card plus toggle height.
- **Checks:**
  - Typecheck, lint and jest pass: 410 tests, 15 of them new in `map.test.ts`. They cover the tiers, the area rows with a searched centre, the region maths, the search threshold, the view setting, and supercluster running under Jest.
  - Android and web bundles export. expo-doctor reports the same 7 out-of-date patch versions as before.
  - **Not yet seen on a device:** there's no emulator here, so the map needs the 0.8.0 preview APK.
- **Owner to do before the build:**
  1. In Google Cloud, create a project with billing, and enable only "Maps SDK for Android".
  2. Create an API key restricted to Android apps: package `com.nathann2997.fuelforecast` plus the SHA-1 of the EAS signing key (`npx eas-cli credentials -p android`). Add a budget alert.
  3. Store the key as `GOOGLE_MAPS_ANDROID_API_KEY`: `npx eas-cli env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value <key> --environment preview --environment production --visibility sensitive`. Use sensitive visibility, not secret, so local `eas update` and `expo config` can read it too.
  4. Build: `npx eas-cli build -p android --profile preview`. When it finishes, update `sydney/pipeline/app_release.json`.
- **Device checks:**
  - **Toggle:** it switches both ways, the view is remembered after a restart, and the button doesn't hide the last list item.
  - **Performance:** tags render, and panning stays smooth at 20 km.
  - **Clusters:** they split when tapped.
  - **Search this area:** it shows after panning, and Back returns.
  - **Station card:** Directions, Pin and Details work. The card sits above the tab bar, with the toggle above it.
  - **Dark mode:** the map and tags are styled correctly.
  - **No area set:** the map shows all of Sydney.
  - **Location withdrawn:** the "you" dot disappears and the header says "last known".
  - **Area change:** a new area clears a "Searched area".
  - **Location re-read:** switching apps doesn't pull a panned map back.
  - **Tag rendering:** tags aren't blank or clipped on first paint at 20 km, or right after a fuel switch (the 400 ms `tracksViewChanges` window).
  - **Google logo:** it stays visible with a card open.
  - **First native compile:** this is the first build of react-native-maps 1.29 on RN 0.88 with the new architecture.

## 2026-10-25 — Web dashboard matches the app again (`template.html`, pipeline only)

The dashboard last matched the app on 22 Oct. This brings in the 23 Oct design review and the 24 Oct copy review.
- **Today:**
  - The verdict card no longer has "Best for you".
  - It uses the app's "Sydney median Xc/L" line and "1 day / 3 days / 7 days / 14 days" tiles.
  - "Why we think this" has the app's three facts.
- **Your stations** (new, under the verdict as in the app):
  - Pin or Unpin from an open station row; at most 10.
  - Saved in this browser when storage is allowed. They don't sync with the app.
  - A pinned station with no price for the fuel shows "No E10 here". One that's gone from today's data shows "Not in today's prices" and can still be unpinned.
  - Keys are name, postcode and coordinates, because 26 name and postcode pairs cover two sites (e.g. two 7-Eleven Mosman). The data has no station codes, and `build.py` isn't changed.
- **Quieter rows:** an advice chip that only repeats the Sydney headline is left out, as in the app (`echoesSydney`).
- **Wording, as in the app:**
  - The plain model card and backtest note.
  - Accuracy stats: "average miss, 7 days ahead", "right direction" and "if you assumed no change". The table reads Ahead / No change / Bowser / Better by / Direction, without "Shock months".
  - The chart legend "Middle 80% of stations" and "Wholesale price".
  - Data freshness labels.
  - "Prices as of" in the header and the stale banner.
- **Published copy:** the freshness label now reads "Oil and exchange rate (EIA, RBA)". `DASHBOARD_CREDITS` rewrites the template's FRED label, which stays true for the Claude scheduled task.
- **Brand:** the page title is "Bowser" with no descriptor (`docs/BRAND.md`).
- **`<meta charset="utf-8">`:** without it, a host that sends no charset decodes the page as Latin-1, the inline script no longer matches its CSP hash, and the page goes blank. GitHub Pages sends UTF-8, so the live site wasn't affected.
- **Checks:**
  - A full local export on a scratch copy, with no credit warnings.
  - Headless Chrome at 500 and 1280 px.
  - A CDP test: pin, reload, unpin, an orphaned pin, junk and duplicate stored keys, twin stations and a fuel switch, with no console errors.
  - A QA audit with no high-severity issues left; fixed from it: the twin-key collision, unremovable orphan pins, `Object.prototype` keys, the page jumping on pin, stale labels, and the toggle semantics.

## 2026-10-24 — Copy review: plain words for drivers (JS, all runtimes for the update notice)

A content review of every screen, the widget, alerts and the update notice. The audience is a few Sydney drivers who open Bowser before a drive. The share page already read well and is unchanged.
- **Errors:** cards said things like "forecast.json: HTTP 500". They now say "Check your connection and try again", "Something went wrong on our end. Try again soon", or, for a schema mismatch, "Update the app to keep getting prices". Location errors from the phone are reworded the same way.
- **One word for one number:** savings, the fill sheet, the "Logged" message and the You saved tile said "Sydney average" for the median that Today, the station page and the charts call the median. Now it's "Sydney median" everywhere, and Savings explains it once ("the middle price: half of Sydney's stations charge less, half more"). The planning docs were updated to match.
- **More:**
  - The model card is in plain words ("What it predicts", "What it looks at", "How it learns", "How it's tested", "Limits"); the jargon is gone (LightGBM, Huber loss, walk-forward, AUC).
  - Accuracy stats read "average miss, 7 days ahead" and "if you assumed no change"; the table reads "Ahead / No change / Bowser / Better by", with "none" in place of a negative gain.
  - The backtest note gives months ("Jan 2021 to Aug 2026"), not codes.
  - Data sources read "Wholesale prices (AIP)", "Oil and exchange rate (EIA, RBA)" and "Days of station prices saved".
  - The analytics note is shorter and says what's collected.
- **Charts:** the legend reads "Middle 80% of stations" (the p10–p90 band; it used to say "Cheapest to dearest 10%"), "Wholesale price" and "Forecast, likely range". The tooltip and the Trends note match.
- **Smaller fixes:**
  - "Prices as of" in place of "Prices from".
  - "Open settings" in sentence case.
  - The Android widget tip now reads "Touch and hold an empty spot…".
  - The station with no prices message, the widget's "No E10 prices at your pinned stations", and the fill-sheet note.
  - The iOS small widget showed "BOWSER" in capitals (against the brand sheet); it now reads "Bowser".
  - Curly apostrophes in visible and spoken text.
- **Update notice:**
  - Title "A new version of Bowser is ready".
  - Install steps: "Tap Update, then Install on the page that opens…".
  - Reassurance: "Your settings, pinned stations and fills stay as they are".
  - A "Version 0.6.1 → 0.7.0" line.
  - The release notes are rewritten as "What's new", plus the crash-report notice.
- **Checks:** a QA copy review was run and its fixes applied. tsc, lint and jest (396) pass.
- **Shipped:** OTA to `preview` 0.7.0 71471044; the update notice again on older runtimes, from their `ota/` branches: 0.6.1 6faeb6e8, 0.6.0 12ecb1ce, 0.5.0 a72e63d4, 0.4.0 3d784066, 0.3.0 aa2cccf6. New release notes live in `api/v1/app.json` (run 40050456357).

## 2026-10-24 — OTA updates apply on the first open (JS only, runtime 0.7.0)

- **Why:** the owner still saw "Best for you" and the old Today a day after OTA 707a5929 was published. The server side was right: 707a5929 was the newest `preview` update for runtime 0.7.0, and the 0.7.0 APK is a `preview`-channel build. But expo-updates' default (no `checkAutomatically` / `fallbackToCacheTimeout` in app.json) downloads a new update in the background at launch and only runs it on the *next* cold start, and Android keeps the app in memory, so a "reopen" often isn't a cold start.
- **Fix:** `lib/ota.ts`.
  - **At launch:** the app checks for an update while the splash is up. If one downloads within 2.5 s it restarts into it, so the new version shows on the first open. The splash has its own 4 s backstop.
  - **On resume:** coming back after 30+ minutes away does the same within 3 s.
  - **Otherwise:** anything slower is kept for the next launch, as before. Failures (offline, a failed restart) just carry on.
  - **Cost:** at most one extra network round trip before the splash hides.
  - This fix arrives the old way itself: it takes two full restarts once, then later updates apply on the first open.
- **Checks:** QA audit done, with no high issues. Fixed from it:
  - A failed restart could reject unhandled or hold the splash.
  - The launch wait is shortened from 3.5 s to 2.5 s.
  - The resume wait is shortened from 6 s to 3 s.
  - A stale splash-timing comment in `update-notice.tsx`.
  - On Android, the JS check queues behind the native launch download (no conflict) and can't loop after a restart.
  - tsc, lint and jest pass (396).

## 2026-10-23 — Design review: a simpler Today, quieter lists, labels that fit (JS only)

Notes: `docs/DESIGN.md` "Design review — 2026-10-23".
- **Today** (owner's request):
  - "Best for you" is removed, along with `bestPick()`.
  - The verdict card now leads straight into the fuel's trend and then **Your stations**, which always shows (with a hint on how to pin when empty).
  - Cheapest nearby comes next, then "You saved" and the details. "Calls right" stays at the bottom.
  - "Cheapest near" drops the postcode.
- **Station rows** (Today, Stations): the advice chip is left out when it only repeats the Sydney headline, such as "Wait" on every row on a Wait day. Fill by, Fill now, Skip for now, Check price and differing advice still show. Screen readers still hear the advice.
- **Fits at 360 dp:**
  - Forecast tiles say "1 day" instead of a wrapped "TOMORROW" (Today and the station page). The station page's screen-reader text says "In 1 day".
  - Station stats say "Avg gap · vs median" and "Jumps · 5c or more" instead of clipped labels.
  - The fuel picker uses short names on one row (More, Welcome).
  - Subtitles drop the fuel name, which the fuel chip already shows.
- **Station page:** the duplicate top-bar pin is removed; the Pin / Pinned button stays.
- The web dashboard deliberately keeps its layout (shared with the Claude task); `copy.ts` notes the split.
- **Checks:** QA audit done, with no high or medium issues. Fixed from it:
  - "Skip for now" was hidden on Wait days.
  - Station tile screen-reader text.
  - A stale test comment.
  - Out-of-date DESIGN.md notes.
  - tsc, lint and jest pass. Web preview at 360 and 390 px, light and dark, with and without pins.

## 2026-10-22 — Today: "Calls right" moves to the bottom (JS only)

- At the owner's request, the track record tile ("Calls right 83%", opens `/track`) moves from under the verdict to the foot of Today, above the footer. Your pinned stations now come straight after the verdict, or after "You saved" if you've logged a fill.
- `ProofStrip` is split into `SavingsStrip` (under the verdict, shown once you've logged a fill) and `TrackStrip` (the bottom). At full width the tile shows the full sub line ("tested on 2021–2026 prices"), so the unused `Headline.short` is removed.
- **Checks:** QA audit done, with no issues. tsc, lint and jest pass (388). Web preview at 390 px.

## 2026-10-22 — "A new version of Bowser is available" on every older version (pipeline + JS, all runtimes)

Owner rule: until Bowser is listed on an app store, every app older than the latest APK shows this notice.
- **App:** `src/components/update-notice.tsx` runs on every cold launch, 1.5 s after start.
  - It reads `api/v1/app.json`. If this platform's version is newer than the installed one, it shows a dialog: "Bowser X is available", the release notes, and Update (opens the EAS build page) / Later.
  - Offline, or with no file, nothing shows.
  - Only `https://expo.dev/` links open.
  - The component is self-contained (its own colours, no app imports) so the same file runs on older versions.
  - Analytics event `update.notice` (shown/update/later).
- **Pipeline:** `sydney/pipeline/app_release.json` is edited by hand after each native build: version, build URL and notes. `export_api.py` checks it and publishes it as `api/v1/app.json`. A bad file fails soft: no file, a `meta.warnings` entry and a GitHub warning.
- **Older versions:** each runtime's last shipped code plus the notice, as an OTA update to `preview`. Built in worktrees on branches `ota/<runtime>-update-notice`:

  | Runtime | Base commit |
  |---|---|
  | 0.6.1 | d1b7b92 |
  | 0.6.0 | a7669a5 |
  | 0.5.0 | c87518d |
  | 0.4.0 | fad2598 |
  | 0.3.0 | cd87c96 |
  | 0.1.0 | 15f9dd8 |

  Published update groups: 0.7.0 bd3b975b, 0.6.1 38c92ce8, 0.6.0 4ba3b268, 0.5.0 83fdf46c, 0.4.0 77d65a40, 0.3.0 e5967a3a. **0.1.0 is unreachable**: its APK was built without expo-updates, so it can't receive any OTA.
  0.7.0 phones get it with this release's OTA. Phones pick it up on their next launch and show the notice on the launch after that.
- **QA audit:** no high-severity issues. Fixed from it:
  - Links are pinned to Bowser's own EAS build pages, by the same rule in the app and the pipeline (ASCII only).
  - Each platform is validated separately, only known fields are published, and runner paths are stripped from warnings.
  - The notice asks once per app process, so a remount doesn't ask again.
  - An 8 s fetch timeout, and a 3.5 s start delay so it appears after the splash.
  - Body text scrolls at large font sizes; header role and modal accessibility; translucent nav bar.
- **Release step from now on:** after a native build finishes, set `app_release.json` to its version and build URL, then push. It goes live with the next pipeline run, or run `gh workflow run daily.yml`.

## 2026-10-22 — Data health: alerts and automatic fixes for the app's data (pipeline + workflow, no app change)

Runbook: `docs/DATA_HEALTH.md`.
- **Prevention:** `export_api.py` now hides implausible station prices from the app's data.
  - A price is hidden if it's more than 45c under or 80c over its fuel's Sydney median, or outside 80–600c. Before this, a slip like 23.9 for 239.9 would have ranked cheapest in Sydney, topped "Best for you" and shown on the widget.
  - The widest real gaps in the stored snapshots are −22c and +37c.
  - The hidden fuel is also dropped from that station's own file. It's listed in `meta.warnings`. `build.py`'s data and the dashboard are untouched.
- **Detection:** `sydney/pipeline/health.py` checks the live API the way the app reads it (cache-busted). It uses the standard library only.
  - Freshness: yesterday's data after 07:30, or no refresh for 5.5 h between 07:30 and 23:30.
  - Core files, forecast sanity, the station count, and the share of NSW prices that changed in a day.
  - Outliers, and implausible median moves (over 50c, or a spike and reversal; real hikes reach 39c).
  - Station files, the track record, the share page, and the pipeline's own warnings.
- **Fixes and alerts:** `sydney/pipeline/remediate.py`.
  - Re-runs the pipeline for problems a re-run clears: never while one is running, not within 12 min of a success, at most 4 a Sydney day and 40 min apart, and none after 12 runs of any kind that day.
  - Re-enables a schedule GitHub paused.
  - Alerts through one `data-health` GitHub issue that @mentions the owner. Fixable problems alert only when a re-run didn't clear them or the budget is spent (then labelled `needs-human`); others alert at once. The issue gets a comment only when a new problem appears, and closes on recovery.
  - The decisions are a pure `plan()`, unit-tested.
- **Workflow:** `.github/workflows/data-health.yml` runs after every daily-forecast run and every 30 minutes. GitHub skipped most of today's scheduled slots, so the monitor also stands in for missed runs. It self-tests before each check (`test_health.py`, 24 tests). It runs no third-party code, and has only `actions: write` and `issues: write`.
- **Dependabot (investigated, nothing to change yet):** 3 open alerts:
  - `node-forge` 1.4.0 (high), via the Expo CLI and `@expo/code-signing-certificates`.
  - `braces` 3.0.3 (high), via `patch-package` → `micromatch`.
  - `sprintf-js` 1.0.3 (moderate, dev), via Jest coverage.
  - None has a patched release yet, and none is in the shipped app bundle (checked in an Android export). They run only on a developer machine or EAS builder with trusted input. Dependabot will open update PRs when fixes land.
- **Checks:** QA audit done, with no high issues. Fixed from it:
  - Real hike days would have alerted.
  - Loop safety rested on one bot login string; the bot is now recognised by actor type, with a hard stop on all runs.
  - Comment spam while a fix runs.
  - Alerts while a successful run settles.
  - An early-morning overdue that contradicted the 07:30 grace.
  - Anyone could edit the issue's state through a comment.
  - Unescaped station names in the issue.
  - A silent re-enable failure.
  - The quarantine was tested by planting 23.9 and 2399.0 in a scratch export. Live check and dry run are clean.

## 2026-10-22 — Bowser 0.7.0: app analytics with EAS Insights and EAS Observe (native, runtime 0.7.0, not shipped)

- **Packages:** `expo-insights` 58.0.11 (app usage and cold starts by version and platform: EAS dashboard → Insights → App usage) and `expo-observe` 58.0.16 (performance, errors and custom events: EAS dashboard → Observe, or `npx eas-cli observe:*`). Neither needs a config plugin.
- **Runtime:** both are native modules, so `version` goes from 0.6.1 to **0.7.0**. A 0.6.1 APK (build 8962e8d6) was already building without them. An OTA update with this code would crash 0.6.1 phones at launch. Needs a new preview APK. The 0.7 builds A–D (JS only) can still go to 0.6.1 as an OTA from d1b7b92.
- **Performance:** `ObserveRoot.wrap` on the root layout records cold/warm launch, bundle load and first render. The Expo Router integration records per-route render time and time to interactive. Every screen calls `useReady()` once its main data is shown or has failed. Network traces cover the API host only.
- **Errors:**
  - Unhandled JS errors and native crashes are recorded automatically.
  - Render errors are reported from the root `ErrorBoundary`, which still shows expo-router's retry screen.
  - Rise-alert scheduling failures and widget render, refresh and background-task failures are also reported.
  - Queries that give up after their retries log `data.fetch_failed` with the file, HTTP status and online state.
  - `uploadSourceMaps` on the preview and production profiles gives readable stack traces.
- **Feature events** (`src/lib/analytics.ts`):
  - `onboarding.finished` (start/skip), `area.set` (gps/suburb), `area.locate_failed`.
  - `settings.changed` (which keys changed, plus fuel, sort, radius, toggles, brands and advice filters), `filters.reset`.
  - `station.pinned` / `station.unpinned` / `station.pin_full`, `fill.logged` / `fill.removed`.
  - `share.opened` (deal/savings, sent or dismissed), `directions.opened`, `alerts.toggled`.
  - Every event and metric carries the fuel, alerts on, has area (GPS or suburb), discount-brand count, pin count and fill count, so usage can be split by them.
- **Privacy:** no coordinates, suburb, home area, prices paid or typed text are sent; an area is reduced to "set or not". The new `analytics.test.ts` checks this. More → About now says Bowser sends anonymous usage and crash reports, never your location, area or what you paid.
- **Environment:** set to the EAS Update channel (`preview` / `production`), so tester and store data stay apart.
- **QA audit:** no high-severity issues. Fixed from it:
  - The quiet GPS area refresh (`use-area.ts`) is no longer tracked; it would have traced the phone's movements.
  - `settings.changed` is coalesced over 1.5 s, so typing a max price is one event.
  - A filter reset logs only `filters.reset`.
  - `fill.logged` no longer says whether the fill was discounted or below the median.
  - `useReady` catches the async `markInteractive` rejection.
  - `data.fetch_failed` skips expected 404s and failures while saved data is showing.
  - `area.locate_failed` sends a reason code (denied/timeout/other) instead of the error text.
- **Open (owner):**
  - Update the Play Data Safety and App Store privacy answers: diagnostics and product interaction, not linked to identity. Insights and Observe also send an install ID, the device/OS and the request IP.
  - Decide whether to add an in-app opt-out. It would be `Observe.configure` with `dispatchingEnabled: false`, resending the full config.
  - Network traces and the router integration record which station pages are opened (public station codes) against the install ID.
  - Ship OTA updates with `eas update --upload-source-maps` so stack traces from updates are readable.
- **Checks:** tsc, lint, expo-doctor (20/20) and jest (383) pass. Android and web bundles export.

## 2026-10-22 — Bowser 0.7 build D: share a deal, share your savings (pipeline + JS, runtime 0.6.1, not shipped)

Plan: `docs/BOWSER_0.7_PLAN.md` §D.
- **Station page:** a Share icon in the top bar sends "7-Eleven Granville East (Granville East): Unleaded 91 235.9c/L today, 1.8c under the Sydney median. Bowser says: Fill by Sun 25 Oct." with a link. The message uses the pump price; your discounts aren't shared.
- **Share page `…/FuelForecast/s/?id=<code>&f=<fuel>`** (`sydney/pipeline/share.html`, published by `export_api.py`):
  - Shows the station's pump price, gap to the median, Bowser's advice and reason (or a stale-price warning), and its other fuels.
  - "Have Bowser? Open it" (`fuelforecast://station/<id>`) and Directions buttons.
  - Light and dark; the CC BY-SA attribution.
  - Every write uses `textContent`. The id must be digits, and Directions uses numeric coordinates only.
  - A CSP in `<head>` pins the one inline script and style block by sha256 and limits fetch to the site.
  - It fails soft: no page, plus a GitHub `::warning::` annotation.
- **Savings:** "Share my savings" ("Bowser has saved me $23.40 on fuel since 1 Oct (5 fills)…"), shown only when the total is positive.
- **Web:** share buttons are hidden on browsers without `navigator.share`.
- **Checks:** QA and security audit done, with no high or medium issues. Fixed from it:
  - Title-casing now matches the app's `stationName()`.
  - The stale-price note was hidden when a station had no reason.
  - Footer contrast below AA in light mode.
  - The silent web share.
  - "average" vs "median" wording.
  - The Open button's wording for friends without the app.
  - A stray `aria-label`.
  - CSP placement.
  - The silent fail-soft.
  - tsc, lint and jest pass (378). Scratch export rendered in headless Chrome at 320–390 px, light and dark, under the CSP.

## 2026-10-22 — Bowser 0.7 build C: track record, "Was Bowser right?" (pipeline + JS, runtime 0.6.1, not shipped)

Plan: `docs/BOWSER_0.7_PLAN.md` §C.
- **Pipeline (app path only).** New `sydney/pipeline/track_api.py`, called from `export_api.py`. `build.py`, the Claude task and `main`'s store are unchanged, and `sydney/store/calls.csv` is gitignored on `main`.
  - **Live calls:** the first call of each Sydney day per fuel goes to `store/calls.csv` on the `data` branch. It's appended only after every output is written, and never on `--allow-stale`.
  - **Replay:** the same `verdict()` rule is applied to the walk-forward backtest, using the model running live.
  - **Scoring:** both are scored on the average Sydney median over the 7 days after. A call is complete once the window's last day is over and at least 5 of its days are known. Fill is right at +1c or more and wrong at −1c or less; Wait is the mirror; No rush is right under 3c and wrong at 5c or more.
  - **Output:** new `api/v1/track.json` (about 1 KB), documented in `sydney/README.md`. Damaged rows in `calls.csv` are skipped. The file fails soft like the station files.
  - **Replay today:** U91 83%, E10 82%, P98 81% and diesel 88% right.
- **App:**
  - **`/track`:** "Was Bowser right?" with the % right (replayed "tested on 2021–2026 prices" until 10 live calls have played out, then live), a right/close/wrong bar, and recent calls. Each call shows the date, the call, the median it was made at, what happened ("Prices averaged 2.3c lower the week after" / "So far 1.2c lower (4 of 7 days)"), what following it was worth on your tank, and its status. "How calls are scored" explains the rule.
  - **Today:** the proof strip gains a "Calls right 84%" tile. Savings is now "You saved".
  - **More:** a "Track record" link under "How good is the forecast?".
  - `useTrack` doesn't retry a 404 (an API from before 0.7), and the screen says the record arrives with the next update.
  - The app's savings window now uses the same "last day is over" rule.
- **Checks:** QA audit done, with no high or medium issues. Fixed from it:
  - A call could be recorded on a day whose API never published.
  - The replay used a different model from the live one.
  - One bad CSV row hid the whole record.
  - Pending calls could be scored on a partial day.
  - A local run wrote into `main`'s store.
  - Two a11y labels.
  - The repeated `sys.path` insert.
  - tsc, lint and jest pass (378). The pipeline was run on a scratch copy (twice, plus junk rows, `--allow-stale` and no parquet files). Web preview at 360 and 390 px, light and dark, against the scratch API.

## 2026-10-22 — Bowser 0.7 build B: fill log and savings (JS only, runtime 0.6.1, not shipped)

Plan: `docs/BOWSER_0.7_PLAN.md` §B. Builds on A: a fill records your price after discounts.
- **Filled up:** a new action on the station page, next to Map and Pin. It opens a sheet with the price you paid (prefilled with your price today) and the litres (your tank size), both editable and rounded to 0.1. Saving shows "Logged. 7.8c under the Sydney average, about $3.90 saved."
- **Fill log:** `lib/fills.ts` keeps fills on the phone (`fills.v1`), newest first, up to 500, and checks every stored entry on load.
- **Savings** (`lib/savings.ts`) are worked out per fill against the Sydney median for your fuel:
  - Where: the median that day, less what you paid.
  - When: the average median over the 7 days after, less the median that day. It counts once at least 5 of those days are in `history.json`.
  - Both use the same base, the end-of-day median once history has it, so where + when is exactly what you saved against the average price that week. Either part can be negative.
- **Screens:**
  - `/savings` shows the total, fills, litres and the date since; the where and when split; each fill (tap to open its station, ✕ then Remove, which disarms after 4 s); and "How savings are counted".
  - Today has a new proof strip under the verdict with a "Saved with Bowser" tile, shown once you've logged a fill.
  - More has a "Your fills and savings" link.
- **Shared Sheet** now lifts above the keyboard (edge-to-edge Android doesn't resize the window). This helps the fill and discount sheets.
- **Known data gap:** `history.json` has no medians for 1–12 Oct 2026 until NSW publishes October's monthly history. Fills from late September to mid-October show their timing as pending until then, and the screen says why.
- **Checks:** QA audit done. Fixed from it:
  - The keyboard could cover the sheet.
  - The three action buttons overflowed at 360 dp; they now have 14 dp side padding.
  - The median is only recorded when the forecast is today's.
  - Where and when used different bases.
  - A double tap could log twice.
  - Remove stayed armed and was 36 dp tall.
  - Sign wording near $0.
  - Asymmetric cent rounding.
  - The button label had no "c" unit.
  - tsc, lint and jest pass (369). Web preview checked at 360 and 412 px, light and dark.

## 2026-10-22 — Bowser 0.7 build A: your price after discounts (JS only, runtime 0.6.1, not shipped)

Plan: `docs/BOWSER_0.7_PLAN.md` §A.
- **Discounts:** More → Your car → Discounts lists your cents off per brand (a docket, a fuel card, a membership). **+ Add a discount** opens a sheet with a −/+ stepper (1c steps, 1–30c) and a brand picker built from today's brands, with search. Saved in settings (`discounts`), up to 12, cleaned on load (`lib/discounts.ts`), and kept on the phone.
- **Lists rank by what you pay:**
  - `StationRow.price` is now pump − discount, and the row also gets `pump` and `off` (`geo.ts stationRow`).
  - Because of that, Cheapest sort, Max price, Best for you, "saves $ vs avg" and the gap to the median all follow your price.
  - Rows and Best for you show a green "4c off" chip. Screen readers hear the price with the discount and the pump price.
- **Station page:** the ticker stays the pump price, with a "You pay 229.9 with your 6c off at 7-Eleven" line under it. The no-history fallback has the same line.
- **Widget (Android and iOS):**
  - Rows, the gap note, the 7-day forecast and the small widget's "best" line use your price, and the widget redraws when discounts change.
  - The widget cache now keeps each station's brand. A cache from before this change has none, so it counts as not fresh and the widget refetches.
- `Button` gained `disabled`.
- **Checks:** QA audit done. Fixed from it:
  - Renaming a discount onto a brand you already had silently overwrote that discount. That brand is now left out of the picker.
  - Save stayed tappable with no brand chosen.
  - The fallback had no "You pay" line.
  - A widget cache without brands showed pump prices for up to 2 h.
  - The plan said the widget was out of scope.
  - tsc, lint and jest pass (366). Web preview checked at phone width in light and dark (Today, Stations, More, the sheet, the station page).

## 2026-10-22 — app-ci fixed: Expo SDK 58 patch updates (app 0.6.1, needs a new APK)

- **Why CI failed:** `expo-doctor` checks against the latest SDK 58 patch releases. Expo published new patches, so 10 packages were one patch behind (`expo` 58.0.16 → 58.0.17, plus constants, linking, network, notifications, router, splash-screen, status-bar, updates and jest-expo). Typecheck, lint and jest were already passing.
- **Fix:** `npx expo install --fix`. It also registered `expo-status-bar`'s new config plugin in `app.json`. `expo-doctor` now passes 20/20, `tsc` and lint are clean, and jest passes 343/343.
- **Version 0.6.1:** the native fingerprint changed (`expo-modules-core`, notifications, updates, the status-bar plugin). The runtime policy is `appVersion`, so the bump keeps future OTA updates off the installed 0.6.0 APKs. Otherwise those APKs would run JS built for newer native modules.
- **Effect:** 0.6.0 installs keep working but stop receiving OTA updates until a 0.6.1 preview APK is built and installed.

## 2026-10-22 — Web dashboard redesigned to match the Bowser app (`template.html`)

- **Same order as the app's Today screen:** the decision, the place, the saving, then the evidence (`docs/DESIGN.md`).
- **Look:**
  - The app's tokens (`constants/theme.ts`) in light and dark, the system font with tabular figures, and the Bowser wordmark.
  - The Barlow/Plex fonts, the dark price board and the monospace digits are gone.
- **Hero card:**
  - Coloured by the decision: amber means act, blue means wait, neutral means no rush.
  - Shows the verdict, the rise date, and "Best for you" (the cheapest recent price in your area, with the saving per tank).
  - The saving is in dollars for your tank size.
  - A 14-day sparkline with the likely range and the rise-day marker, plus a compact 1/3/7/14-day row.
  - The logic is ported from `lib/outlook.ts`. `verdict()` is unchanged and still mirrored in `export_api.py`.
- **"Why we think this"** is a collapsed section with the margin text, the jump risk and the ranges.
- **Stations:**
  - Area search, or "Use my location".
  - Radius and Cheapest/Nearest segments, and chips for Members-only, older prices and brands.
  - Compact app-style rows with an advice chip and the gap to the median. Tapping a row expands it to show the reason, its freshness and a map link.
  - Prices older than 7 days are hidden by default. The list shows 10 at a time.
- **Trends:**
  - A cycle summary line, the history chart, and three key insight cards.
  - Brand premiums as bars instead of a chart.
  - "More facts" and "About this chart" are collapsed.
- **How good is the forecast:**
  - One plain sentence, then the accuracy table.
  - "How it works", the backtest chart (drawn when opened) and data freshness are collapsed.
- Fuel, tank size, area, radius and members-only are remembered in `localStorage`. Every read and write is guarded, so the page works without it.
- **Unchanged:** the `__DATA__` contract with `build.py` and the three `DASHBOARD_CREDITS` strings. There is still a single inline `<script>` with no `on*=` handlers, so `export_api.py`'s CSP hash still applies. Checked by a headless Chrome render at 390 px and 1280 px, in light and dark, with a suburb search.

## 2026-10-22 — Data sources, licence notices and "Refreshed" times (pipeline + OTA at runtime 0.6.0)

### Brent and AUD/USD no longer come from FRED (GitHub pipeline)
- **Why:** FRED's terms (2024) prohibit using FRED content "in connection with the development or training of any software program… machine learning", and the forecast model (LightGBM) trains on these two series.
- **New sources** (`fetch.py` `pull_macro`):
  - Brent spot (RBRTE) from the U.S. EIA, which is the series FRED republishes.
  - AUD/USD (F11.1 FXRUSD) from the RBA.
- **Same shape as before:** they're written with FRED's column ids. `update.py` replaces the `data` branch's `store/fred.csv` with them in full, so no FRED values are kept and `model.py` is unchanged.
- **Fresher data:** Brent now runs to 20 Oct and AUD/USD to 21 Oct. FRED stopped at 14 Oct.
- **Effect on the forecast:**
  - Like for like (both cut at 14 Oct), Brent is identical and AUD/USD differs by 0.36% on average (RBA 4 pm Sydney vs Fed noon NY). The forecast barely moves: U91's 7-day jump chance goes from 43% to 41%, and its 14-day change differs by about 1.7c.
  - The fresher oil data does move it. Brent fell from US$126.5 to US$115.2 between 14 and 20 Oct, so the first run will lower U91's jump chance from about 43% to about 11%. FRED would have delivered that drop within days anyway.
- **The Claude scheduled task is unchanged.** `pull_fred.js` still pulls FRED, so `main`'s `store/fred.csv` stays FRED-sourced. A newer Chrome FRED file still wins in `update.py`.
- `requirements.txt`: added `xlrd` for the `.xls` files.

### Licence and attribution (NSW FuelCheck is CC BY-SA 3.0 AU)
- **New `DATA-LICENSE.md`:**
  - The NSW data and Bowser's adaptations are CC BY-SA 3.0 AU, with credit to the State of NSW (NSW Fair Trading), a note of the changes made, and no endorsement implied.
  - Not licensed here: AIP wholesale prices (© AIP), and Brent and AUD/USD. EIA cites Refinitiv as its source, and the RBA cites WM/Reuters.
- **Every API file** carries `generated_at`. `forecast.json`, `stations.json` and `history.json` also carry `attribution` and `license_note`. `meta.json` carries the full `license` object: sources, terms and exclusions.
- **The published dashboard copy** credits the right sources and the licence (`DASHBOARD_CREDITS` in `export_api.py`). `template.html`, which the Claude task shares, is unchanged.
- **More → Data sources** shows the full credit line, plus links to the CC BY-SA licence and to the FuelCheck dataset. The source line is now "Brent (EIA) and AUD (RBA)".

### "Refreshed" times in the app
- **New `refreshedText`** in `lib/format.ts` gives the Sydney-time publish time from the API's `generated_at`: "Refreshed 10:13 am", "Refreshed yesterday, 9:13 pm" or "Refreshed Tue 20 Oct, 9:13 pm".
- **Where it shows:**
  - The subtitles on Today, Stations and Trends.
  - Today's footer, which now reads "New prices up to 5 times a day" (it was "Updated each morning").
  - More → Data sources.
- **Older cached files** without `generated_at` fall back to the date, as before.
- **Not on the station page:** above the price, "Refreshed" would read as the station's own price age.
- **Not in the widgets yet.**

### QA audit, fixes applied
- **Source claims corrected.** Removed "public domain" for Brent and "Source: RBA" licensing for AUD/USD. Both are now credited with their vendors and kept out of the CC BY-SA scope.
- **AIP exclusion list completed** with `stats.margin_now` and `stats.margin_typ`.
- **The time formatter falls back** to the engine's own string if Hermes doesn't return hour, minute and am/pm parts.
- **The string field is now `license_note`**, so it doesn't clash with meta.json's `license` object.
- **A stale EIA/RBA file** in a local inbox can't override a newer FRED pull.
- **README:** the schedule is up to 5 runs a day.

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
Preview APK (Android 0.6.0, all of §1–5): EAS build 4ae2119b, https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/4ae2119b-9c0a-4f3e-92fb-3673d9b6df9d
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

### 5. Stations: "Near you in Parramatta", and nearby that follows the phone (JS)
- **The area line names your suburb.** It read "◎ Near your location"; with a GPS area it now says where you are, e.g. "◎ Near you in Parramatta · 5 km".
  - The name is the nearest suburb within 3 km (`nearestSuburb` / `areaName` in `lib/geo.ts`), from the stations file's suburb list: offline, with the same names as the area search.
  - A suburb's position is the average of its stations' positions, so the name can be a neighbouring suburb that has stations.
  - Names with digits are skipped: the live list has a few "Postcode 2153" placeholders and unparsed addresses (a pipeline cleanup for later).
  - A typed suburb shows as typed, without the ◎ (which now means "from GPS").
- **It doesn't pass old positions off as live.** When the phone can't locate at all (permission withdrawn, location switched off), the line reads "Near Parramatta · 5 km · last known".
  - A read that only times out (indoors) doesn't count.
  - Any fix marks it live again, including "Use my location".
  - A slow read that finds no location can't override a fix that landed meanwhile; a counter of fixes decides this (`lib/location.ts`, `useAreaLive`).
- **Nearby follows the phone more closely** (`hooks/use-area.ts`):
  - The position is re-read when Stations or Today mounts or comes into focus (at most once a minute), and on every return to the foreground. One read runs at a time across screens.
  - A cached position is reused only if under 2 min old (was 10).
  - The list re-sorts when you've moved more than 200 m.
- **The radius and "last known" never get cut off**; only a long place name does.
- **QA audit, fixes applied:**
  - Junk suburb names are skipped.
  - The live-state race is fixed, with tests (`location-live.test.ts`).
  - Timeouts no longer count as "last known".
  - Location reads are deduplicated.
  - The cutoff is 3 km (was 5).
  - The truncation-safe layout above.

### 6. Scrolling no longer gets caught by the station-row swipe (JS, OTA at runtime 0.6.0)
OTA for §6–7 on `preview`, runtime 0.6.0: update group bfa8a90a-4abb-45fd-a953-61ad50b1968a.
- **Cause:** the swipe (gesture-handler `ReanimatedSwipeable`) started after only 10 dp of sideways travel. The screens scrolled in react-native's `ScrollView`, which can't cancel a gesture-handler pan. So any scroll that drifted 10 dp sideways in total became a swipe mid-scroll and stopped scrolling.
- **The screens now scroll in gesture-handler's `ScrollView`**, with its `RefreshControl` (`Screen` in `components/ui.tsx`). It takes part in gesture arbitration: once it starts scrolling, it cancels the rows' pending swipes.
- **A swipe now needs 24 dp sideways** (`SWIPE_START` in `components/station-row.tsx`), so a diagonal start favours the scroll. A deliberate swipe still opens Pin/Unpin and Map as before.
- The fuel sheet's scroll view is unchanged (it has no swipe rows).

### 7. "Directions" shows the station on the map instead of starting a trip (JS, OTA at runtime 0.6.0)
- **The station page's button and the row's swipe button now open the maps app on a named pin for the station.** They used to start turn-by-turn navigation. Google Maps / Apple Maps offer directions from there if wanted.
  - **Android:** `geo:0,0?q=lat,lng(name)` (was `google.navigation:`).
  - **iOS:** `maps://?ll=…&q=name` (was `daddr`).
  - **Web fallback:** a Google Maps search URL (was a directions URL).
  - Brackets in station names ("BP Mosman (9542)") are encoded so the Android label stays whole.
  - The functions are now `openInMaps` / `mapUrls` in `lib/directions.ts`. A test checks that no URL can start navigation.
- **Labels and icons match the behaviour:**
  - The Map buttons use a map-pin icon (`MapPinIcon`), not the navigation arrow.
  - The station page's button and the swipe button say **Map** (were "Directions" / "Go").
  - The screen-reader action is "Show on map".
  - The swipe hint reads "Swipe a station left to pin it or see it on the map."

### 8. Security hardening, no app behaviour change and no new build (review of 22 Oct)
- **Dashboard: stored XSS fixed** (`sydney/pipeline/build.py`, `template.html`):
  - **Before:** station names, brands, suburbs and advice text from the NSW API were inserted as raw HTML. The data block wasn't escaped either, so a station name containing `</script>` broke out of it. A test with a crafted name injected an `<img onerror>` and stopped the page's script.
  - **Data block:** now escaped for an inline script (`\u003c`, `\u003e`, `\u0026`).
  - **Inserted text:** every API string put into `innerHTML` goes through `esc()`.
  - **Content-Security-Policy on the GitHub Pages copy only** (`export_api.py`, added after its credit rewrite). It pins the page's inline script by sha256, so an injected `<script>` or `on*=` handler won't run. Scripts load only from cdnjs, styles and fonts only from Google Fonts, and the page can make no network requests, frames, form posts or plugin loads. The Claude task's artifact copy has no CSP (its host wraps the page).
  - **Chart.js:** loaded with Subresource Integrity (cdnjs's published sha512). The no-referrer policy is set.
  - **Tested:** the same malicious data now renders inert, and the page, chart and tables work as before.
- **Workflow: least privilege** (`.github/workflows/daily.yml`). The single job became three:

  | Job | Token | What it does |
  |---|---|---|
  | build | read-only | Runs the third-party Python packages with the NSW secrets |
  | save | `contents` + `actions` write | Runs only git/gh: commits store/ and archive/ to `data`, keep-alive |
  | deploy | `pages` + `id-token` | Pages only |

  - **The job token is never written to disk.** Checkout uses `persist-credentials: false`. The `data` branch is read anonymously (public repo), and the token reaches only the `git push` command, as a masked auth header. It used to sit in a remote URL and in checkout's saved credentials for the whole job.
  - **All actions are pinned to commit SHAs** (the same major versions) in both workflows.
  - **The backtest input is passed via `env`**, not pasted into the script.
- **App, JS only, ships with the next update:**
  - **Pins:** only station codes (digits) are kept, so junk from storage or a crafted `fuelforecast://` link is ignored without a "pins full" message.
  - **Map links:** API coordinates must be numbers to reach a URL.
  - **API files:** files over 25 MB (by Content-Length) aren't parsed, by the app or the widget.
  - **Widget:** keeps only stations with a name and real coordinates.
  - **Tests:** `pins.test.ts` is new and `filters.test.ts` is extended.
- **Repo:** `.gitignore` now ignores secrets by pattern (`.env*`, `*.pem`, `*.key`, keystores, `*credentials*`, with examples allowed) and `sydney/inbox/`.
- **Left for a new build:**
  - The widget image provider is exported, which leaks location.
  - Android Auto Backup is on.
  - Unused template permissions are still granted.
  - OTA code signing isn't set up.
- **Needs the owner:**
  - 2FA on Expo and GitHub.
  - Rotate the NSW secret if this folder has been synced.
  - Delete `sydney/pipeline/pull_nsw.js`, which is superseded by `fetch.py`.
- **Pipeline** (on top of the iOS session's 80f4c66):
  - **Station codes:** must be digits (`update.py`, and again in `export_api.py` before they become `station/{code}.json` file names), so a code like `../forecast` can't overwrite an API file. All 1,321 real codes are digits.
  - **Downloads** (`fetch.py` `get`):
    - https only, from `nsw.gov.au`, `aip.com.au`, `eia.gov` and `rba.gov.au` and their subdomains. Scraped AIP and CKAN links are checked, and so is the final URL after redirects.
    - Each download is streamed with a 100 MB cap; the largest real file is about 7 MB.
  - **Python dependencies:** locked with hashes for Python 3.11 on Linux (`requirements.txt`, compiled with uv from the new `requirements.in`). These are the versions a fresh install resolves today. pip refuses any file whose hash doesn't match.
  - **`defusedxml`** added, so openpyxl parses xlsx XML through it.
  - **Warnings:** `meta.warnings` drops runner file paths from exception text.
- **QA audit, fixes applied:**
  - The CSP moved to the Pages copy (and became hash-based).
  - The save job refuses to save if the `data` branch moved during the build, or if the state artifact has no `store/daily.csv`.
  - `.gitignore` no longer ignores `*secret*`, which was too broad.
- **Tested:**
  - A hostile station name renders as text.
  - The exported Pages dashboard renders fully under the hash CSP with no refusals, with the EIA/RBA credit rewrite intact.
  - `fetch.py` downloaded AIP (through its redirect and scraped link) and queried CKAN under the allow-list.
  - App: tsc, lint and jest (343) pass.

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
