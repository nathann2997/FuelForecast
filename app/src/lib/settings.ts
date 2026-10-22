// Small persisted settings shared across tabs (the fuel applies to every screen; the filters to the Stations tab).
import Storage from './storage';
import { useSyncExternalStore } from 'react';

import { setContext, settingsAttributes, settingsContext, track } from './analytics';

import { cleanDiscounts, type Discounts } from './discounts';
import { ADVICE_GROUPS, FILTER_DEFAULTS, RADII, type FilterSettings } from './filters';
import type { Place } from './geo';
import type { Fuel } from './types';

export type Settings = FilterSettings & {
  fuel: Fuel;
  tankL: number;             // for "$ saved on a tank"
  home: Place | null;        // remembered area (GPS fix or suburb), stays on the phone
  onboarded: boolean;        // the welcome screen has been seen (or skipped)
  alerts: boolean;           // a notification the morning before a likely price rise (lib/alerts.ts)
  discounts: Discounts;      // cents off by brand: lists rank by the price you pay (lib/discounts.ts)
};

const KEY = 'settings.v1';
export const DEFAULTS: Settings = { ...FILTER_DEFAULTS, fuel: 'U91', tankL: 50, home: null, onboarded: false, alerts: false, discounts: {} };

const FUEL_CODES: readonly Fuel[] = ['U91', 'E10', 'P98', 'DL'];
const GROUPS = new Set<string>(ADVICE_GROUPS.map(([g]) => g));

/** Merge a saved object over the defaults, keeping only fields of the right shape. Saved settings from older
 *  versions (fewer fields) or a damaged value never break the app. */
export function normalize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  const o = raw as Record<string, unknown>;
  const bool = (k: keyof Settings) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (DEFAULTS[k] as boolean));
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const home = o.home as Place | null | undefined;
  const okHome = home && typeof home === 'object' && typeof home.la === 'number' && typeof home.lo === 'number' ? home : null;
  return {
    fuel: FUEL_CODES.includes(o.fuel as Fuel) ? (o.fuel as Fuel) : DEFAULTS.fuel,
    tankL: typeof o.tankL === 'number' && o.tankL > 0 ? o.tankL : DEFAULTS.tankL,
    home: okHome,
    sort: o.sort === 'distance' ? 'distance' : 'price',
    radiusKm: (RADII as readonly number[]).includes(o.radiusKm as number) ? (o.radiusKm as number) : DEFAULTS.radiusKm,
    members: bool('members'),
    showStale: bool('showStale'),
    pinnedOnly: bool('pinnedOnly'),
    brands: [...new Set(strs(o.brands))],
    advice: [...new Set(strs(o.advice))].filter((g) => GROUPS.has(g)) as Settings['advice'],
    maxPrice: typeof o.maxPrice === 'number' && o.maxPrice > 0 ? o.maxPrice : null,
    // Saved before the welcome screen existed: someone who already set an area doesn't need it
    onboarded: typeof o.onboarded === 'boolean' ? o.onboarded : !!okHome,
    alerts: bool('alerts'),
    discounts: cleanDiscounts(o.discounts),
  };
}

/** The saved settings, read fresh from storage (for the widget task, which can outlive app changes). */
export function loadSettings(): Settings {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let state = loadSettings();
const listeners = new Set<() => void>();
setContext(settingsContext(state));

// Changes within a moment of each other (typing a max price, tapping several chips) are logged as one event
let unlogged: Partial<Settings> = {};
let logTimer: ReturnType<typeof setTimeout> | null = null;
function logChange(patch: Partial<Settings>) {
  unlogged = { ...unlogged, ...patch };
  if (logTimer) clearTimeout(logTimer);
  logTimer = setTimeout(() => {
    track('settings.changed', settingsAttributes(unlogged));
    unlogged = {};
    logTimer = null;
  }, 1500);
}

/** `silent`: not a user's choice (the quiet GPS refresh) or logged as its own event (filters.reset) */
export function setSettings(patch: Partial<Settings>, { silent = false } = {}) {
  state = { ...state, ...patch };
  try {
    Storage.setItemSync(KEY, JSON.stringify(state));
  } catch {
    // settings still apply for this session
  }
  listeners.forEach((l) => l());
  if (!silent) logChange(patch);
  setContext(settingsContext(state));
}

/** Back to the default filters (fuel, tank and area are kept) */
export function resetFilters() {
  setSettings({ ...FILTER_DEFAULTS }, { silent: true });
  track('filters.reset');
}

export const getSettings = () => state;

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
