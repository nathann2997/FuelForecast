# Bowser analytics plan (2026-10-29)

Product owner: Nathan. PM: Claude. Status: **PostHog chosen (2026-10-29) and built into 0.9.0.** Defaults taken: a Share anonymous usage switch (on by default), session replay off, its own native build. The original evaluation follows the metrics.

## Key metrics (what the dashboard shows)
Small numbers: at about 10 installs, read counts and per-install tables, not percentages. All metrics leave out test phones (`internal = true`: dev builds, and any phone whose version number in More was tapped 5 times) and events marked `background = true`.

| # | Metric | Definition (PostHog) | Answers |
|---|---|---|---|
| 1 | **Installs acting on the advice** (main metric) | Weekly unique installs with `app.opened`, then in the same week `station.opened`, `directions.opened` or `fill.logged` | Is Bowser doing its job: does a look lead to a decision? |
| 2 | **Weekly active installs** | Weekly unique installs with `app.opened` | How many use it |
| 3 | **Retention** | Weekly cohort retention: first `app.opened` → `app.opened` in later weeks (week 1 and week 4 matter) | Do testers come back? |
| 4 | **Activation funnel** (first 7 days) | First-ever `app.opened` → `area.set` → `onboarding.finished` → `station.pinned` or `station.opened` → `fill.logged`. Only installs whose first event has `hasArea = false`: people upgrading from 0.8.0 have no first run to measure | Where the first run loses people |
| 5 | **Advice vs action** | `station.opened`, `directions.opened` and `fill.logged` per install, split by the `verdict` property (act / wait / calm) | Do "Fill up" days lead to more filling and Map taps than "Wait" days? |
| 6 | **Entry sources** | `app.opened` split by `source`: launcher, widget, alert, share, link | What brings people in: is the widget or the rise alert worth it? |
| 7 | **Feature reach** | Share of weekly active installs that, in the week: viewed the map (screen `/stations` with view=map), used filters (`filters.opened`), set a discount (`settings.changed` keys contains discounts), pinned, logged a fill, shared (`share.opened`), viewed `/track` or `/trends`, turned alerts on (`alerts` property), opened from the widget | What's used and what's dead weight |
| 8 | **Quality** | `data.fetch_failed` per weekly active install; crash-free sessions (EAS Observe); `$app_version` (the APK) and `update` (the OTA update id) spread; `update.notice` action=update | Is it broken, and are people on the latest version? |

Every event carries: the app version, the OTA `update` id, the channel (preview / production), fuel, alerts on, has area (and whether by GPS), discount-brand count, pins, fills, the current Sydney `verdict` for your fuel, and `internal`. Screens are named by route pattern (`/`, `/stations`, `/station/[id]`, `/savings`, `/track`, `/trends`, `/more`, `/welcome`).

## What was built (0.9.0)
- `posthog-react-native` behind the existing `track()` in `lib/analytics.ts`; EAS Observe and Insights unchanged.
- **Config:**
  - person profiles always (anonymous installs, no accounts);
  - `disableGeoip`;
  - lifecycle events off (`app.opened` is the one open event);
  - no feature flags, surveys or error autocapture;
  - a `before_send` that strips location, area, price, IP and time-zone fields whatever a future event adds, while keeping the SDK's `$geoip_disable` flag.
- **Foreground only:** PostHog is only ever started by the root layout with the app in front (`components/analytics-tracker.tsx`), never by the widget task or a background refresh.
  - If the app is still loaded, events from those tasks (`inBackgroundTask`) carry `background: true`.
  - Android briefly reports "background" for a permission dialog, the share sheet or Maps opening on top. That isn't treated as leaving the app.
- **Opens:**
  - The first time in front after a fresh start is the cold open.
  - A later return counts only after at least a minute away, or when a link or alert brought it back.
  - No open is logged while the app is restarting into an OTA update; the restarted app logs it.
- **Sharing off:** an opted-out install never contacts PostHog, and Observe's events stop too. Observe's crash reports stop once Bowser has been fully closed.
- **`app.opened` with `source`:**
  - widget links carry `?src=widget`, and the share page's "Open it" link carries `?src=share`;
  - a tapped rise alert is counted once (deduped by its id and date);
  - anything else is the launcher.
- **New events:** `station.opened` (from list / map / fill, or widget / share / link when a link lands on a station page; pinned), `filters.opened`, `analytics.internal`.
- **More:**
  - a "Share anonymous usage" switch: PostHog stops straight away, Observe at the next launch;
  - About text naming PostHog and Expo;
  - the version number marks a test phone.
- **Key:** the PostHog project key and host come from EAS environment variables `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`, inlined at bundle time. Without them PostHog stays off, and an OTA update at runtime 0.9.0 switches it on.

## Owner actions in PostHog
1. Create the project. US or EU hosting is chosen at sign-up; that's decision 2 below.
2. Settings → "Discard client IP data": on.
3. Settings → "Filter out internal and test users": add `internal = true`.
4. Send the project API key (starts `phc_`) and host to Claude for the EAS environment variables.
5. Optional: a personal API key with the MCP Server preset, so Claude can build the dashboard above and answer questions directly. Keep it out of the repo.



## The job analytics should do
Bowser has a handful of testers, each opening it a couple of times a week before a drive. We want to learn what they actually do, so we build the right things and catch what's broken. Concretely:

1. **Do testers come back?** How many use it each week, and does each install keep coming back (week-1, week-4 retention)?
2. **Where does the first run lose people?** Welcome → area set → first pin → first fill logged.
3. **Which features are used, and which are never touched?** Pins, the map, filters, discounts, fill log, savings, share, track record, Trends, the widget, rise alerts.
4. **What does one install do in a session?** Screen by screen, in order, so a confusing flow shows up.
5. **What brings people in?** Opened from the launcher, the widget, a rise alert, or a shared link.
6. **Does the advice change behaviour?** After "Fill up this week", do people open a station, tap Map, or log a fill?
7. **Which app versions are still out there,** and did the update notice move them?

At this size (around 10 installs), per-install timelines and simple funnels matter more than big aggregate charts.

## What we have today, and why it isn't enough
- **EAS Observe** (`expo-observe`, since 0.7.0): startup and per-screen load times, JS errors and native crashes, plus our own events (`lib/analytics.ts`, 15 event names).
- **EAS Insights** (`expo-insights`): launches by version and platform.

They're good at "is it fast, is it broken". They can't answer the questions above:
- no funnels;
- no retention cohorts;
- no per-install journey across sessions;
- no "users who did X then Y";
- event lists are only grouped by name, so questions 1–6 mean exporting rows and counting by hand.

**Keep both.** Observe stays the crash and performance tool. What's missing is a product-analytics tool next to it.

## Constraints any option must meet
- **The privacy promise already shipped.**
  - The location permission text says the position never leaves the phone.
  - More → About says: "Bowser sends anonymous usage and crash reports … They never include your location, your area or what you paid."
  - Whatever we add must keep that true, or the text changes first.
  - IP-based city lookup counts as location. So does the suburb field.
- **One choke point.**
  - Every event already goes through `track()` and `EventName` in `lib/analytics.ts`, and `analytics.test.ts` checks that nothing personal leaks.
  - A new tool becomes a second destination behind `track()`, not a rewrite.
- **A new native build.**
  - Every serious option needs native modules: Firebase always; PostHog needs `expo-device` and `expo-localization`, which aren't installed yet.
  - So it ships as **0.9.0 with a new APK** and an `app_release.json` bump.
  - The new SDK must never reach the `ota/*` branches or 0.8.0 phones. An OTA update that imports a missing native module crashes on launch, as the Observe rollout showed.
- **Querying from Claude.** "Analysed effectively" includes being able to ask Claude.
  - The BigQuery connector is already connected here.
  - PostHog and Amplitude have MCP servers; Amplitude's plugin is installed here but needs authorising.

## The options

| | **PostHog** (cloud) | **Firebase / Google Analytics 4** | Amplitude | Mixpanel | Aptabase | TelemetryDeck |
|---|---|---|---|---|---|---|
| **Free tier** | 1M events, 5K session replays, 100K errors a month. 1 project, 1-year retention, no card; usage stops at the limit. *(official pricing page)* | Unlimited events. Explorations keep data up to 14 months. | ~10K tracked users / 2M events *(unverified: sources disagree)* | ~1M events *(unverified)* | 20K events, no funnels or retention listed *(official)* | 50K events for new accounts *(vendor blog)* |
| **Funnels, retention, paths** | Yes, in the UI | Yes, in Explorations; clunky for apps | Yes | Yes | No | Some |
| **One install's event stream** | Yes: person page and activity, live | Only through DebugView (test devices) or BigQuery | Yes | Yes | Session timeline | No |
| **How fast data shows** | Seconds | Realtime view covers 30 minutes; reports take up to ~24 h | Minutes | Minutes | Live view | Minutes |
| **Location from IP** | On by default; turn off with `disableGeoip` and the project's "discard client IP" | IP isn't stored; city level is on by default, and "granular location and device data" can be turned off for the property, leaving state level | *(unverified)* | *(unverified)* | *(unverified)* | *(unverified)* |
| **Advertising ID** | No | **Yes on Android by default** (`AD_ID` permission merged in). Needs a manifest flag and a permission removal, then checking the merged manifest | No | No | No | No |
| **Querying from Claude** | Official MCP server (hosted, needs a key or OAuth) | Through the BigQuery export, which the connected BigQuery MCP can read. Sandbox tables reportedly expire after 60 days *(unverified)*; past that needs billing | MCP (installed, needs auth) | *(unverified)* | *(unverified)* | *(unverified)* |
| **Expo integration** | JS SDK plus `expo-device` and `expo-localization` (Expo modules). Screen views by hand from `usePathname` | `@react-native-firebase/app` and `/analytics` (v26 needs the New Architecture, which we have), `google-services.json`, config plugin. **iOS must switch to static frameworks** (`useFrameworks: 'static'`, `forceStaticLinking`), with known v26 build issues (SPM). Untested against our maps and widget pods | JS SDK | JS SDK | JS SDK | JS SDK |
| **Session replay** | Yes (separate native plugin) | No | Paid add-on | Some free | No | No |

### Firebase, fairly
Firebase's strengths are real:
- unlimited free events;
- Google's long track record;
- a raw-event export to BigQuery we could query from here.

If Bowser goes on the Play Store and grows into thousands of users, Firebase's "free at any size" matters more than it does now.

The costs at our stage:
- **Too slow and too summarised for 10 people.** Reports lag up to a day. GA4 is built around aggregate audiences, so questions 2 and 4 mostly need BigQuery SQL.
- **It collects the advertising ID on Android by default.** That contradicts "anonymous" and adds a Play Data Safety declaration, unless we strip it and verify the merged manifest.
- **City-level location is on by default.** It has to be turned off in the property's "granular location and device data" setting, which still leaves state level (NSW). GA4 itself doesn't store IP addresses.
- **The iOS build has to change linkage**, with reported v26 problems.

### PostHog
PostHog answers all seven questions in its own UI:
- trends and retention (1);
- funnels (2, 6);
- feature usage counts (3);
- per-install activity (4);
- event properties for where an open came from (5);
- the app version on every event (7).

The other points in its favour:
- Data shows up in seconds, and it has an official MCP server.
- It carries no advertising ID.
- IP-based location can be switched off in both the SDK and the project.
- The free tier is about 1,000 times our volume, and it stops instead of charging.

The costs:
- It's another account and another vendor.
- Screen tracking with Expo Router is a few lines we write ourselves.
- Data is hosted in the US or the EU (Frankfurt), not Australia.

### The rest, in a line each
- **Amplitude:** strong product analytics, but its free-tier terms are unclear (third-party sources disagree, and one says it was renamed in 2026, unverified).
- **Mixpanel:** similar to PostHog for funnels and retention; I didn't check its tooling for querying from Claude.
- **Aptabase and TelemetryDeck:** privacy-first and simple, but they don't do funnels or retention, which is the gap we're trying to fill.

## Recommendation
**PostHog Cloud, alongside Observe, behind the existing `track()`.** What decides it:
- It answers questions 2 and 4 directly, in real time, at 10 users.
- It can do that without breaking the "anonymous, never your location" promise.

Firebase is the better pick if the priority is free at any scale plus BigQuery. If you prefer it, the same `track()` design works; budget for the advertising-ID removal and the iOS linkage change.

## How it would work (if PostHog)
- **Identity:**
  - One anonymous ID per install, generated by the SDK.
  - No `identify()`, since there are no accounts.
  - Person profiles on, so retention and per-install timelines work.
- **No location:** `disableGeoip: true` in the SDK, plus "Discard client IP data" in the project settings. `analytics.test.ts` gains a check on what the PostHog destination is sent.
- **Context on every event:** the existing `setContext()` values become registered properties.
  - fuel, alerts on, has area, discount count, pins, fills;
  - app version and channel.
- **Screens:** one `screen` event per route change, from Expo Router's `usePathname`/`useSegments`. Only the route pattern is sent (`/station/[id]`), not the address or suburb.
- **New events to fill the gaps:**
  - `app.opened` with a source: launcher, widget, alert, shared link. This needs the deep-link handlers to say where they came from.
  - `station.opened` with a source: list, pin, map, Today.
  - `map.opened`, `filters.opened`, `trends.opened` and `track.opened`. These may come free from screen events.
  - `alert.shown` and `alert.opened`.

  The existing 15 events keep their names.
- **Session replay: off.** It would record the suburb field and the prices typed in unless masking is checked screen by screen. We can revisit for a single tester's phone if a bug needs it.
- **Background tasks stay out:** today `track()` also runs in the Android widget's headless task and the iOS background refresh (e.g. `syncAlerts` calling `setSettings`). Counted as activity, those would inflate weekly users and retention for every install with the widget. So PostHog only gets foreground events: the client is created by the root layout, and `track()` skips it elsewhere.
- **Delivery:** batched; offline events are queued and sent later. The SDK can't crash the app: every call goes through `track()`'s try/catch.
- **Release:**
  - 0.9.0 native build and the `app_release.json` bump, so older phones see the update notice.
  - CHANGELOG and HANDOFF.
  - QA audit before commit.
- **Querying:** connect PostHog's MCP server to Claude Code with a project-scoped key, so you can ask Claude the seven questions directly.

## Things that change for testers
- **More → About text:**
  - It keeps "anonymous" and "never your location, area or what you paid".
  - It adds that usage is linked to an install, not a person, and names PostHog.
- **Play Data Safety** (when listed): "App activity: app interactions; diagnostics; not linked to identity; not shared".

## Decide
1. **(decide) Tool:** PostHog (recommended) or Firebase.
2. **(decide) Hosting:** PostHog US or EU (Frankfurt). Neither is in Australia. EU has the stricter privacy regime; latency doesn't matter for analytics.
3. **(decide) Opt-out switch** in More ("Share anonymous usage"). It's cheap to build and makes the promise easier to keep. Recommended: on by default, with a switch.
4. **(decide) Session replay:** off (recommended), or opt-in for named testers only.
5. **(decide) Timing:** ship with the next native build (0.9.0), or as its own build now.

## Effort
About a day, once decided:
- the SDK and wrapper changes;
- screen tracking;
- the new events;
- tests;
- the About text;
- the QA audit;
- a 0.9.0 APK.

The PostHog account and project, and the MCP key, are for you to create. The app only needs the project's public key and host.

## Sources
- Expo: [analytics SDKs for React Native](https://docs.expo.dev/guides/using-analytics/)
- PostHog: [pricing](https://posthog.com/pricing), [React Native SDK](https://posthog.com/docs/libraries/react-native), [MCP](https://posthog.com/docs/model-context-protocol)
- Firebase: [RN Firebase Analytics](https://rnfirebase.io/analytics/usage), [RN Firebase](https://rnfirebase.io/), [v26 SPM + static linkage issue](https://github.com/invertase/react-native-firebase/issues/9161), [Android data collection](https://firebase.google.com/docs/analytics/android/configure-data-collection), [AD_ID merged by the SDK](https://github.com/firebase/firebase-android-sdk/issues/2582), [GA4 event limits](https://support.google.com/analytics/answer/9267744), [GA4 granular location and device data](https://support.google.com/analytics/answer/12002752), [GA4 BigQuery export](https://support.google.com/analytics/answer/9823238), [Firebase to BigQuery](https://support.google.com/firebase/answer/6318765), [BigQuery sandbox](https://cloud.google.com/bigquery/docs/sandbox)
- Others: [Aptabase pricing](https://aptabase.com/pricing), [TelemetryDeck pricing update July 2026](https://telemetrydeck.com/blog/pricing-update-2026/), Amplitude and Mixpanel free tiers from third-party summaries ([Amplitude](https://agentdeals.dev/vendor/amplitude), [Mixpanel](https://rybbit.com/blog/mixpanel-pricing)), unverified against the vendors' own pages.
