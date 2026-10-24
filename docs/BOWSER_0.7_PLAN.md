# Bowser 0.7 — "prove it" release plan (2026-10-22)

Product owner: Nathan. PM, design and build: Claude. This is the single source of truth for this release.

## Why this release
Bowser answers "fill now or wait, and where", but the value it creates is invisible. Nothing shows whether the advice was right or how much it saved. This release makes that visible:

- **Your price**: ranks stations by what *you* pay after your discounts.
- **Fill log and savings**: proves Bowser is saving you money.
- **Track record**: proves Bowser's calls are right (or shows where they weren't).
- **Share a deal**: gives friends a reason to pass Bowser on.

The money at stake (U91, last 12 months): the cheap-to-dear station spread (p10–p90) averages 24c/L, which is about $12 on a 50 L tank. The monthly cycle moves the median 30–45c/L.

## Build order: one at a time, each building on the last
| # | Build | Depends on | Why this order |
|---|---|---|---|
| A | Your price (discounts) | – | It defines "the price you pay", which B logs and D must *not* share |
| B | Fill log and savings | A | A fill records your price (pump − discount); "when you filled" uses the 7-day window that C also uses |
| C | Track record | B's 7-day window | The same "the week after" window as B's timing saving, so the two screens agree |
| D | Share a deal / share savings | A, B, C | It shares a station's pump price and verdict, and B's savings total |

Every build follows the same steps: design, then build, then checks (`tsc`, `expo lint`, `jest`, and new logic gets unit tests), then the web preview at phone width in light and dark, then a QA agent audit with its findings fixed, then the CHANGELOG, then a local commit. The release is not pushed or shipped until the owner says so (see "push live" in HANDOFF).

**Runtime:** all four builds are JS only, plus one new API file and one new static page from the pipeline. No native modules or app.json changes are needed, so `version` stays **0.6.1** (bumped for the SDK patch update in dc26f56). The release ships as an OTA update to runtime 0.6.1, which reaches phones once the 0.6.1 preview APK is installed. React Native's built-in `Share` API needs no new native module.

## A — Your price (discounts)
- **Setting:** `discounts: Record<brand, cents>`, up to 12 brands and 0.5–30c each. It lives in `lib/settings.ts` (normalised like every other field) and stays on the phone.
- **Editing:** More → Your car → **Discounts**.
  - Each saved discount is a row (brand, −4c, Remove).
  - **Add a discount** opens a sheet with a single-select brand picker (the same chips and search as Filters, built from today's brands) and a −/+ stepper (1c steps, default 4c), then Save.
  - The copy names examples ("supermarket docket, fuel card, membership") but never claims which brand honours which program. The user knows their own discounts.
- **Effect:**
  - `rankStations` / `pinnedRows` take the discounts. `StationRow.price` becomes *your* price, and the row also gets `pump` and `off`.
  - Because of that, sorting, Max price, Best for you, "saves $ vs avg" and the gap to the median all follow your price with no further changes.
  - The station row shows your price big, plus a neutral chip "4c off" beside the advice chip.
  - The station page ticker keeps the pump price (its history is the pump's), with a line under it: "You pay 224.9 with your 4c off".
- **Widget (Android and iOS):** the widget gets the discounts through `readPrefs()`. Its rows, the gap note, the 7-day forecast and the "best" line all use your price. The widget's cache now keeps each station's brand (`b`). A cache from before 0.7 has no brands, so it counts as not fresh and the widget refetches.
- **Not in A:** shared deals use pump prices on purpose (your friends don't have your discount).

## B — Fill log and savings
- **Entry:** on the station page, a third action, **Filled up**, opens a sheet. It's prefilled with the fuel (the page's), the price you paid (your price today, editable) and the litres (your tank size, editable). Save, then a note: "Logged. 4.2c under the Sydney median, about $2.10 saved."
- **Storage:** `lib/fills.ts`, a store keyed `fills.v1` like `pins.ts`, newest first, capped at 500. A `Fill` holds `{ id, date (Sydney ISO), stationId, name, brand, suburb, fuel, pump, paid, litres, median }`, where `median` is the Sydney median for that fuel on that day.
- **Savings, per fill:**
  - **Where** = (Sydney median that day − paid) × litres. Known at once.
  - **When** = (average Sydney median over the 7 days after − median that day) × litres, from `history.json`. It needs at least 5 of those 7 days; until then the fill shows "pending".
  - **Total** = where + when, which equals what you saved versus paying the average price at a typical time. Both parts can be negative and are shown honestly.
- **Screen `/savings`:**
  - The total, the number of fills and the date since; the where/when split; and a per-fill list (date, station, litres, paid, saving, pending marker) with Remove.
  - An empty state explains how to log a fill.
- **Surfaces:** a Today card "Saved with Bowser $23.40 · 5 fills" (only when there are fills), and More → "Your fills and savings".

## C — Track record ("Was Bowser right?")
- **Pipeline (app path only: `export_api.py`; `build.py`, the Claude task and `main`'s store are untouched):**
  - **Live calls:** every successful run records the day's verdict per fuel in `store/calls.csv` (`date, fuel, cls, head, now, d3, d7, p_jump7`) on the `data` branch. Only the **first** call of each Sydney day is kept: it's the morning call most people act on, and it can't be revised with hindsight. Nothing is recorded with `--allow-stale`.
  - **Replay:** the same `verdict()` rule is applied to the walk-forward backtest predictions (`backtest_preds.parquet` with the production model's 3- and 7-day predictions, plus `backtest_cls.parquet` for the jump chance), which gives "what Bowser would have said" from 2021 to the end of the backtest.
  - **Scoring** (one rule for both, from `store/daily.csv` medians): move = the average median over the next 7 days − the median on the call day (at least 5 of the 7 days needed, else pending).
    - `up` (fill): right if move ≥ +1c, wrong if ≤ −1c, else close.
    - `down` (wait): the mirror of `up`.
    - `flat` (no rush): right if |move| < 3c, wrong if ≥ 5c, else close.
  - **New file `api/v1/track.json`** (schema 1, additive): `{ calls: [{date, fuel, cls, head, now, move, status}] (live, newest first, last 60 days), replay: {fuel: {n, right, close, wrong, from, to}}, live: {fuel: {n, right, close, wrong, since}} }`.
  - It fails soft like the station files: on an error, no `track.json` and a warning.
  - The replay uses the model column that's running live (`ctx.live_model`: "+cycle memory" when full, else "+oil & AUD").
  - Replay check (U91, 2021-01 to 2026-08, "+oil & AUD"): 83% right, 10% close, 7% wrong.
  - A window is complete once its last day is over (before the latest day in `daily.csv`, which is a partial day). The app's savings use the same rule.
- **App:**
  - **Screen `/track`:** the headline "Right N% of the time" (live once there are ≥ 10 scored live calls, else the replay, clearly labelled "tested on 2021–2026 prices"), then the live calls list (date, verdict, what happened: "Prices averaged 3.4c higher the week after", ✓ / ≈ / ✗ / pending), and a short "How we score" disclosure.
  - **Today:** a "Calls right 84%" tile in the proof strip under the hero, next to B's savings tile, so the two kinds of evidence sit together.
  - **More:** a link from "How good is the forecast?".

## D — Share a deal (quick win)
- **Station page:** a **Share** action. React Native's `Share` sends text with the station, the pump price, the gap to the Sydney median, Bowser's advice and a link.
- **Link:** `https://nathann2997.github.io/FuelForecast/s/?id=<code>`, a small static page (`sydney/pipeline/share.html`, copied by `export_api.py`).
  - It reads `stations.json` and shows that station's prices and advice, with **Open in Bowser** (`fuelforecast://station/<id>`) and **Directions**.
  - So friends without the app still see the deal.
  - DOM is built with `textContent` only, the id must be digits, and it has a strict hash-pinned CSP (connect-src to the API only).
- **Savings screen:** **Share** sends "Bowser has saved me $23.40 on fuel since 1 Oct".

## Out of scope
Discounts on the widget, fill reminders (idea 4), commute mode (idea 3), accounts or sync of fills between phones.
