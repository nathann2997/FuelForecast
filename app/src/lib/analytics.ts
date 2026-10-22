// Usage and error analytics, sent to EAS Observe (expo-observe): expo.dev → fuel-forecast → Observe, or
// `npx eas-cli observe:events`. Screen views and load times come from the Expo Router integration (configured in
// app/_layout.tsx) plus useReady() on each screen; this file adds what people do and what went wrong.
// Never send anything personal: no coordinates, suburb or home area, prices paid or station names typed in. Only
// what kind of thing happened. Event names are lowercase and dot-separated; the dashboard groups by exact name, so
// renaming one starts a new series.
import { Observe, useObserve, type ObserveAttribute, type ObserveAttributes } from 'expo-observe';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';

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
  | 'data.fetch_failed';     // a query gave up after its retries

type Severity = 'info' | 'warn' | 'error';

/**
 * Call once at module scope in the root layout, before any screen mounts (the integrations can't change after).
 * Each configure() replaces the whole config, so every option lives here.
 */
export function configureAnalytics() {
  const apiHost = API_BASE.match(/^https?:\/\/([^/:]+)/)?.[1];
  try {
    Observe.configure({
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
  try {
    Observe.logEvent(name, { attributes, severity });
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
