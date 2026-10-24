# Bowser notifications plan (2026-10-24)

Product owner: Nathan. PM: Claude. Status: **proposal, nothing built.** Decisions needed are marked **(decide)**.

## The job notifications do
Bowser is opened a couple of times a week, usually just before a drive. Notifications should cover the moments when the app *isn't* open and a few dollars are at stake:
1. A price rise is coming.
2. A station you use got cheap.
3. You just filled up and should log it.

Every notification must either save money or close a loop. Anything that's only "engagement" gets turned off, because a fuel app that nags gets muted.

## What exists today
- **Rise alert** (`lib/alerts.ts`):
  - One local notification at 7:30 am before Sydney prices are likely to jump.
  - At most one per price cycle (5-day cooldown).
  - Opt-in switch in More and on the welcome screen.
  - No server and no push tokens: scheduled on the phone whenever fresh data arrives.
- **The gap:** fresh data only arrives while the app is open or during a background refresh.
  - **iOS:** `expo-background-task`.
  - **Android:** only the home-screen widget's update, every 4 h. `expo-background-task` is excluded from the Android build.
  - So on Android **without the widget, alerts are only scheduled when you open the app**, which is exactly when you don't need one. Everything below depends on fixing this first.

## Principles (apply to every type)
- **Local first.** Notifications are computed on the phone from the public API, so there are no accounts and no tokens; this keeps the existing privacy stance.
- **Budget:** at most **2 notifications a week**, all types combined, except price targets you set yourself. When two are due, the more valuable one wins (the ranks below).
- **Quiet hours:** nothing between 9 pm and 7:30 am. Anything due then waits until 7:30 am, or is dropped if it's no longer true.
- **Self-correcting:** each notification re-checks its condition just before showing, and cancels itself if the data changed (a rise called off, a price that bounced back).
- **Specific:** every notification names your fuel, a station, a price and a date. Tapping it opens the exact screen (a station page, Today or Savings).
- **Ask at the moment of value,** not at launch. Ask for permission after the first pin, the first fill or the first "rise in 2 days" seen in the app.
- **One switch per type** in **More → Notifications**, each with an Android channel of the same name, so people can mute one kind and keep the rest.
- **Measured:** delivered and opened per type, plus opt-outs (`track('notification.opened', {type})`).

## The notifications, in priority order

### P0. Foundation: background refresh on Android (no user-facing notification)
- Ship `expo-background-task` on Android: remove it, `expo-task-manager` and `unimodules-app-loader` from the Android autolinking exclusions, and register the same refresh task as iOS (minimum interval about 1–2 h). It runs `syncAlerts` and the new triggers below.
- This is native, so it needs a new APK. **Combine it with the pending 0.7.1 SDK patch update**, which needs a new APK anyway.
- Without this, every item below only works for people who've placed the widget.

### P1. Rise alert v2: personal, with a place and a price (upgrade of the existing alert)
- **Trigger:** unchanged (the verdict says fill, or a rise within 2 days; once per cycle).
- **Copy now:** "Unleaded 91 may rise Sat 24 Oct. Open Bowser for the cheapest near you."
- **Copy proposed:**
  > **Fill up before Sat** · U91 likely +12c from Saturday. Your cheapest: **7-Eleven Granville East 229.9** (your price). About $6 saved on 50 L.
  - "Your cheapest" is the cheapest of your pinned stations, else the cheapest within your radius. It uses your price after discounts and skips stale prices.
- **Tap:** that station's page.
- **Follow-up** (counts against the weekly budget): on the morning of the rise day, only if you haven't logged a fill since the first alert, send "Last day before the rise: …".

### P2. Price drop at a pinned station
- **Trigger:** a pinned station's price for your fuel (your price) is
  - (a) at its lowest in 30 days, or
  - (b) at least 5c under its own usual premium vs the median (`profile.typ`),
  - and the Sydney verdict isn't "Wait if you can" (no point nudging during a fall).
- **Copy:** "**Shell North Rocks dropped to 224.9** · its lowest in 30 days, 9c under the Sydney average."
- **Tap:** the station page.
- **Cap:** one per station per 7 days.
- **Optional price target per pinned station (decide):** "Tell me under 225.0", set on the station page. A target you set yourself bypasses the weekly budget, at most once a day per station.

### P3. "Did you fill up?" log nudge (feeds the fill log and savings)
- **Trigger:** you tapped **Map / Directions** on a station page or a swipe action, then 45 min later, if you haven't logged a fill since. Scheduled at the tap, and cancelled if you log a fill first.
- **Copy:** "**Filled up at 7-Eleven Granville East?** Log it to see what Bowser saved you." Android action buttons: **Log 50 L at 229.9** (one tap, your tank size and your price) and **Not now**.
- **Cap:** one per day. It turns itself off after 3 ignored in a row, and the More switch says so.
- **Why:** savings only work if fills are logged, and this is the moment people forget. No background location is needed: the Map tap is the signal.

### P4. Your fill rhythm (after 3+ logged fills)
- **Trigger:** your median days between fills (from the fill log) says you're due within 2 days, and a rise is expected before then, or your pinned station is at a 30-day low.
- **Copy:** "**You usually fill every 9 days; it's been 7.** Prices rise Saturday. Fill at Metro Ashfield 228.9 before then."
- **Tap:** that station.
- It replaces the generic rise alert for people with enough history, so they never get both.

### P5. Sunday digest (opt-in, off by default)
- **When:** Sunday 6 pm, at most weekly.
- **Copy:** "**This week:** U91 down 6c · last week's call was right (waiting saved $2.10 a tank) · you saved $4.73 · cycle day 38, a rise is due."
- **Tap:** Today.
- **Milestones** fold in here rather than being separate notifications: the first $10, $50 and $100 saved, and "10 fills logged".

## Deliberately not doing
- **Background location or geofencing** (to detect a visit to a station): invasive, battery-hungry, and P3 covers the need.
- **"Prices are still falling, keep waiting":** there's nothing to do, so it's noise. Today already says it.
- **Data-outage notifications to users:** the owner gets those through the data-health issue; users just see the "Showing prices from…" banner.
- **Marketing or "we miss you" pings.**

## Option for later: server push (decide)
Local scheduling is only as timely as the background refresh; Android and iOS decide when that runs, typically every 1–4 h. The alternative is to send from the pipeline: after each run, GitHub Actions calls the Expo push service.
- **Gain:** a price jump detected at 10:13 notifies within minutes, the same for everyone.
- **Cost:**
  - Store push tokens with each person's fuel and area or pins, which ends "no accounts, nothing leaves the phone".
  - A small data store, plus a privacy notice update.
  - Per-user logic on the server.
- **Recommendation:** stay local through P0–P5, and measure how late alerts arrive (scheduled time vs data time). Revisit only if over 25% arrive more than 2 h after the data supports them.

## Rollout
| Release | Ships | Build |
|---|---|---|
| 0.7.1 | P0 (Android background refresh) + the SDK patch update (already needs a new APK) + notification open tracking | **New APK** |
| 0.8.0 | More → Notifications screen (switches, quiet hours shown); P1 rise alert v2; P2 pinned price drop; P3 log nudge; permission asked at the moment of value | OTA (if the P3 action buttons don't need new native config), else new APK |
| 0.8.x | P4 fill rhythm; P5 Sunday digest and milestones; optional price targets | OTA |

## How we'll know it works
- **Open rate per type:** P1 at least 30%, P2 at least 20%, P3 at least 40%.
- **Opt-outs:** fewer than 10% per type a month. A type above that gets reworked or cut.
- **P3 works** if fills logged per active user per month at least double within 4 weeks of shipping.
- **P1 and P4 work** if users who get them fill before the rise more often, measured from logged fills vs the rise date. This also feeds the "When you filled" savings.

## Decisions needed
1. **P2 price targets:** ship user-set targets in 0.8.0, or later?
2. **P5 digest:** off by default (recommended), or on for new installs?
3. **Server push:** stay local (recommended) until lateness is measured?
4. **0.7.1:** OK to bundle P0 with the SDK patch APK?
