// Usage and error analytics, to two places (docs/ANALYTICS_PLAN.md):
// - EAS Observe (expo-observe): crashes, load times and these events. expo.dev → fuel-forecast → Observe, or
//   `npx eas-cli observe:events`. Screen load times come from its Expo Router integration plus useReady() on each screen.
// - PostHog: the same events per install, for retention, funnels and journeys. Only ever started by the root layout
//   with the app in front (never by the widget task or a background refresh); events from those tasks, if the app is
//   still loaded, carry background: true. Off without a key, on the web, and when More → Share anonymous usage is off
//   (then nothing reaches PostHog or Observe's events, and Observe's crash reports stop once Bowser is fully closed).
// Never send anything personal: no coordinates, suburb or home area, prices paid or station names typed in. Only
// what kind of thing happened. Event names are lowercase and dot-separated; the dashboard groups by exact name, so
// renaming one starts a new series.
import { Observe, useObserve, type ObserveAttribute, type ObserveAttributes } from 'expo-observe';
import * as Updates from 'expo-updates';
import PostHog from 'posthog-react-native';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { API_BASE } from './api';
import type { Settings } from './settings';

export type EventName =
  | 'onboarding.finished'    // via: start | skip
  | 'area.set'               // source: gps | suburb
  | 'area.locate_failed'
  | 'settings.changed'       // keys changed, plus the new value of the non-personal ones
  | 'filters.reset'
  | 'station.pinned'
  | 'station.unpinned'
  | 'station.pin_full'
  | 'fill.logged'
  | 'fill.removed'
  | 'share.opened'           // kind: deal | savings; shared: false when the sheet was dismissed
  | 'directions.opened'      // ok: false when no maps app took the link
  | 'alerts.toggled'         // on: what was asked; granted: whether they're on afterwards
  | 'data.fetch_failed'      // a query gave up after its retries
  | 'update.notice'          // action: shown | update | later, for the newer APK in api/v1/app.json
  | 'app.opened'             // the one open event (PostHog's lifecycle events are off): source, cold
  | 'station.opened'         // from: list | map | fill; pinned
  | 'filters.opened'
  | 'analytics.internal';    // this phone marked (or unmarked) as the owner's/a tester's own

type Severity = 'info' | 'warn' | 'error';

/**
 * Call once at module scope in the root layout, before any screen mounts (the integrations can't change after).
 * Each configure() replaces the whole config, so every option lives here.
 */
export function configureAnalytics(shareUsage = true) {
  sharing = shareUsage;
  const apiHost = API_BASE.match(/^https?:\/\/([^/:]+)/)?.[1];
  try {
    Observe.configure({
      // More → Share anonymous usage, read at launch: Observe can't be switched mid-session
      dispatchingEnabled: shareUsage,
      // preview testers and store users apart in the dashboard (dev builds have no channel)
      environment: Updates.channel || (__DEV__ ? 'development' : 'production'),
      // Per-route render and time-to-interactive (useReady), tagged with the route pattern, e.g. /station/[id]
      integrations: { 'expo-router': true, 'react-native-reanimated': true },
      // How long the API files take on real networks; only our host, since each request counts toward the quota
      networkTraces: apiHost ? { filter: { hosts: [apiHost] } } : false,
    });
  } catch {
    // the app works without analytics
  }
}

/** Log a named event. Never throws: analytics must not break the feature it measures. */
export function track(name: EventName, attributes?: ObserveAttributes, severity: Severity = 'info') {
  if (!sharing) return;
  try {
    Observe.logEvent(name, { attributes, severity });
  } catch {
    // dropped
  }
  // From a widget task or background refresh (inBackgroundTask): marked, so usage numbers can leave it out. Not decided
  // by AppState: Android reports "background" for a permission dialog, the share sheet or Maps opening on top.
  const props = bgTasks > 0 ? { ...attributes, background: true } : attributes;
  if (!ph) {
    if (early.length < 50) early.push([name, props]);   // before PostHog starts (a screen's first effect): sent on start
    return;
  }
  try {
    ph.capture(name, props);
  } catch {
    // dropped
  }
}

/** Report an error that the app caught and recovered from (unhandled ones are recorded automatically). */
export function reportError(e: unknown) {
  try {
    Observe.reportError(e);
  } catch {
    // dropped
  }
}

// Attached to every event and metric so the dashboard can split by them (fuel, alerts on, …)
const context: ObserveAttributes = {};
export function setContext(patch: ObserveAttributes) {
  Object.assign(context, patch);
  try {
    Observe.setGlobalAttributes(context);
  } catch {
    // dropped
  }
  ph?.register(patch).catch(() => {});
}

// More → Share anonymous usage; off also stops Observe's events at once (its crash reports need a fresh launch)
let sharing = true;
// Events logged before PostHog starts, sent once it does (only if it starts: dropped with the process otherwise)
const early: [string, ObserveAttributes | undefined][] = [];
let bgTasks = 0;
/** Run a widget task or background refresh: anything it logs is marked background */
export async function inBackgroundTask<T>(fn: () => Promise<T>): Promise<T> {
  bgTasks++;
  try {
    return await fn();
  } finally {
    bgTasks--;
  }
}

/** The non-personal part of a settings change: counts instead of brand lists, never the home area itself. */
export function settingsAttributes(patch: Partial<Settings>): ObserveAttributes {
  const a: Record<string, ObserveAttribute> = { keys: Object.keys(patch) };
  for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
    if (k === 'home') a.hasArea = v != null;
    else if (k === 'discounts') a.discountBrands = Object.keys(v ?? {}).length;
    else if (k === 'brands' || k === 'advice') a[k] = v as string[];
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') a[k] = v;
    else if (v === null) a[k] = 'none';
  }
  return a;
}

/** The settings that segment usage, for setContext */
export const settingsContext = (s: Settings): ObserveAttributes => ({
  fuel: s.fuel, alerts: s.alerts, hasArea: !!s.home, areaGps: !!s.home?.gps, discountBrands: Object.keys(s.discounts).length,
  internal: s.internal || __DEV__,
});

/**
 * Marks the screen usable once its main data is on screen (or has failed), for the per-screen time-to-interactive.
 * Only the first call per navigation counts, so it's safe on every render.
 */
export function useReady(ready: boolean) {
  const { markInteractive } = useObserve();
  useEffect(() => {
    if (!ready) return;
    try {
      void Promise.resolve(markInteractive()).catch(() => {});
    } catch {
      // no ObserveProvider (e.g. a test render)
    }
  }, [ready, markInteractive]);
}

// ---- PostHog (product analytics)

// The project key is public (it can only send events); both are inlined at bundle time from EAS environment variables,
// so an OTA update can switch analytics on for a build that shipped without them
const PH_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const PH_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
let ph: PostHog | null = null;

/** Never sent, whatever a future event adds: location, the home area, prices paid, IP-derived place. Not
 *  $geoip_disable: that's the SDK's own "don't look up a place from the IP" flag, and is forced on below. */
const NEVER = /^(\$ip|\$geoip_(?!disable$).*|\$timezone|la|lo|lat|lon|latitude|longitude|home|label|suburb|postcode|address|paid|pump|litres)$/i;
type PHEvent = { event: string; properties?: Record<string, unknown>; $set?: unknown; $set_once?: unknown } & Record<string, unknown>;
export function scrub<E extends PHEvent>(e: E | null): E | null {
  if (!e) return e;
  delete e.$set;   // person properties: nothing sets them, and they're restored from here, not from properties
  delete e.$set_once;
  if (!e.properties) return e;
  for (const k of Object.keys(e.properties)) if (NEVER.test(k)) delete e.properties[k];
  e.properties.$geoip_disable = true;
  return e;
}

let lastScreen: [string, Record<string, string> | undefined] | null = null;

/**
 * Start PostHog once, from the root layout while the app is in front, and only while sharing is on (an opted-out
 * install never contacts PostHog). Returns whether it's running.
 */
export function startProductAnalytics(shareUsage: boolean): boolean {
  sharing = shareUsage;
  if (ph) {
    (shareUsage ? ph.optIn() : ph.optOut()).catch(() => {});
    return true;
  }
  if (!shareUsage || !PH_KEY || Platform.OS === 'web' || AppState.currentState !== 'active') return false;
  try {
    ph = new PostHog(PH_KEY, {
      host: PH_HOST,
      personProfiles: 'always',                 // anonymous installs still get a timeline and retention (no accounts)
      disableGeoip: true,                       // no place from the IP (the project also discards IPs)
      captureAppLifecycleEvents: false,         // app.opened (below) is the one open event
      preloadFeatureFlags: false,
      disableSurveys: true,
      errorTracking: { autocapture: false },    // crashes go to Observe
      customAppProperties: ({ $timezone: _tz, ...p }) => p,   // the time zone is a coarse location
      before_send: (e) => scrub(e),
    });
    ph.optIn().catch(() => {});   // the setting decides; an earlier opt-out stored by the SDK doesn't
    ph.register({
      ...context,
      channel: Updates.channel || (__DEV__ ? 'development' : 'unknown'),
      update: Updates.updateId ? Updates.updateId.slice(0, 8) : 'embedded',   // $app_version can't tell OTAs apart
    }).catch(() => {});
    for (const [name, props] of early.splice(0)) ph.capture(name, props);
    if (lastScreen) ph.screen(...lastScreen).catch(() => {});   // the screen showing before it started
    return true;
  } catch {
    ph = null;   // the app works without analytics
    return false;
  }
}

/** More → Share anonymous usage: PostHog stops or starts now; Observe's events stop now, its crash reports later */
export function setUsageSharing(on: boolean) {
  sharing = on;
  if (on) startProductAnalytics(true);
  else ph?.optOut().catch(() => {});
}

/** A screen view, named by its route pattern (`/station/[id]`), never the address with its values */
export function screen(pattern: string, props?: Record<string, string>) {
  lastScreen = [pattern, props];
  try {
    if (sharing) ph?.screen(pattern, props).catch(() => {});
  } catch {
    // dropped
  }
}

/** Route segments → the pattern PostHog groups by: groups like (tabs) dropped, the Today tab is "/" */
export const routePattern = (segments: readonly string[]) => '/' + segments.filter((s) => !s.startsWith('(')).join('/');

export type OpenSource = 'launcher' | 'widget' | 'share' | 'alert' | 'link';
/** Where a fuelforecast:// link came from: widget and share-page links carry ?src= */
export function linkSource(url: string | null | undefined): OpenSource | null {
  if (!url || !/^fuelforecast:/i.test(url)) return null;
  const src = url.match(/[?&]src=([a-z]+)/i)?.[1]?.toLowerCase();
  return src === 'widget' || src === 'share' ? src : 'link';
}

let pendingSource: OpenSource | null = null;
/** Remember what brought the app to the front, for the next app.opened */
export function noteOpenSource(s: OpenSource | null) {
  if (s) pendingSource = s;
}
export const hasOpenSource = () => pendingSource != null;
/** The app went to the background: a source noted while it was already open doesn't carry over to a later open */
export function clearOpenSource() {
  pendingSource = null;
}
/**
 * One app.opened per time the app comes to the front, once its source is known (`sources` settle, or 1.5 s).
 * `restart` (the OTA check, lib/ota.ts) resolving true means the app is restarting into an update: the restarted app
 * logs the open instead. It's bounded by the check's own timeout, so it isn't raced.
 */
export async function logOpen(cold: boolean, sources: Promise<unknown> = Promise.resolve(), restart: Promise<boolean> = Promise.resolve(false)) {
  if (await restart.catch(() => false)) return;
  await Promise.race([sources.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  track('app.opened', { source: pendingSource ?? 'launcher', cold });
  pendingSource = null;
}
