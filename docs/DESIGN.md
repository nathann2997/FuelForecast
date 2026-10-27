# App design — v0.2 redesign (2026-10-21)

## Who it's for and when they open it
The owner and a few Sydney friends, each with one car. They open it a couple of times a week, usually right before a drive or when the needle is low. The question is always the same: **should I fill up today, and where?** Price history and the model are for building trust. Most people check them once, if at all.

So the app answers in this order: **the decision → the place → the saving → the evidence.**

## Problems with v0.1 (from a review of every screen)
1. **Two answers that disagree.** Today said "Fill up today" while most station cards said "Fill by Fri/Sat/Sun". Both are right (the headline is the Sydney rule, the cards adjust per station), but nothing said that both point to the same rise date.
2. **The answer is written for an analyst.** The headline was followed by margin-over-TGP text and four near-identical forecast tiles (237.6 / 237.8 / 240.4 / 251.2) with "80% range" ranges. What matters to a driver is "prices go up from Saturday, by about 13c, which is about $6.50 a tank."
3. **Today never says where.** The cheapest station nearby was one tap away behind a generic link.
4. **Stations ignored where you are until you asked.** The default list was the cheapest across all of Sydney (Greenacre, Fairfield), which is useless for anyone in Manly. The location wasn't remembered either.
5. **Station cards were 5 lines tall and repeated the same sentence** ("Sydney U91 likely to rise from Sat 24 Oct…") on all 60 cards. Stations not updated for 12 days ranked in the top 3.
6. **The fuel picker took prime space on every tab**, although each person drives one car and sets it once.
7. **Too much content in History and About.** Nine trivia cards of equal weight, plus a model card full of jargon (LightGBM, Huber loss, walk-forward) on its own tab.
8. **Colour fought meaning.** "Fill up today" was set in the same red-orange used for "prices up", and the dark "board" sat in the light theme. Monospace numbers made it look like a dev tool.

## What changed
**Navigation: Today · Stations · Trends · More** (History became Trends; About became More, which holds the settings and how the app works).

**Today**
- A hero card coloured by the decision: amber means act (fill now or this week), blue means wait, neutral means no rush. The headline is still the shared verdict rule (unchanged, mirrored in `template.html` / `export_api.py`).
- Under it, a deadline in plain words, "Prices likely to rise from Sat 24 Oct", computed on the phone with the same rule `build.py` uses for station advice (`market()`, ported to `lib/outlook.ts`). The home screen and the station chips now point to the same date.
- The saving in dollars for your tank size: "about $6.65 on a 50 L tank if you fill before then."
- A 14-day price-path sparkline with the likely range and a marker on the rise day. It replaces the four tiles. The exact numbers sit under it as a compact row.
- **Best near you**: the 3 cheapest fresh stations in your area, with a link to the full list. With no area set, it shows a one-tap "Use my location" or a suburb search.
- "Why we think this" is a collapsed section holding the margin and wholesale explanation and the jump risk.

**Stations**
- The area is remembered (GPS or suburb). It appears as a single bar at the top ("Near Parramatta 2150 · 5 km"), and tapping it opens the search.
- The Sydney rise date appears once at the top. Each row shows only what is specific to that station.
- Compact rows: price and saving vs the median, name, brand · suburb · distance, and an advice chip. Tapping a row expands it to show the station's reason, its freshness and a Directions button, so a stray tap no longer launches Maps.
- Prices older than 7 days are hidden by default (a filter chip shows how many and lets you show them).
- Filters are chips: Cheapest / Nearest, radius, Members-only.

**Trends**: the chart, then four insights that change what you do (the cycle, days since the last jump, how much shopping around saves, brand premium). The other facts sit under "More facts".

**More**: settings (fuel, tank size, area, members-only sites), how good the forecast is (the accuracy table, introduced in one plain sentence), how it works (the model card, collapsed), data freshness, sources, version.

**Visual system**: one tone scale (act / wait / calm / cheap) used for the hero, the chips and the sparkline. Numbers use tabular figures in the system font instead of monospace. Light and dark themes now match, with no dark board in light mode. The fuel choice is a header chip on each screen, so you can still switch quickly without a picker taking up a row.

## Deliberately not changed
- The API, the pipeline, the verdict rule and the station advice text. Everything new is derived on the device from fields that already exist.
- No map, no accounts, no push, Sydney only (product decisions in `HANDOFF.md`).

## Ideas for later (not built)
- An Android home-screen widget showing the verdict and the best nearby price. This fits "open twice a week" even better than the app itself.
- A local reminder on the rise day (on the device only, so no accounts are needed).

# Design review — 2026-10-23

The owner asked for a simpler Today ("show the trend for the fuel and the stations I pin"), then for a full design review. This section supersedes the Today and station-row notes above where they differ.

**Today, top to bottom:**
1. The verdict card: the median, the headline, the dollar detail, the 14-day sparkline, and 1 / 3 / 7 / 14-day tiles.
2. **Your stations**, always shown. With no pins, a one-line hint explains how to pin.
3. **Cheapest near {suburb}**, without the postcode so it fits on one line.
4. **You saved**, once you've logged a fill.
5. Why we think this, then Price trends.
6. **Calls right**, at the bottom.

"Best for you" is gone. It duplicated the cheapest nearby and the pinned stations, and pulled attention from the trend.

**Quieter rows:** a station row's advice chip is left out when it only repeats the Sydney headline. On a "Wait if you can" day, 43 rows each said "Wait". The chip stays when it adds something: a Fill by date, Fill now, Skip for now (that station is dear right now), Check price, or advice that differs from the headline. Screen readers still hear the advice (`echoesSydney` in `lib/copy.ts`).

**Labels that fit 360 dp:**
- Forecast tiles read 1 day / 3 days / 7 days / 14 days ("TOMORROW" wrapped).
- Station stats read "Avg gap · vs median" and "Jumps · 5c or more".
- The fuel picker uses U91 / E10 / P95 / P98 / Diesel ("Diesel" had wrapped onto a second row).
- Screen subtitles drop the fuel name, because the fuel chip beside the title already shows it.

**Station page:** one pin control (the Pin / Pinned button). The duplicate top-bar pin is gone; Share stays in the top bar.

**Not changed:** the web dashboard (`template.html`) keeps its own layout, because the Claude scheduled task shares it.
