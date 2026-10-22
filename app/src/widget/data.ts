// Where the widget's data comes from: the app's own query cache when the app is running, otherwise the static API,
// with a compact copy kept on the phone so the widget can still render (with "as of") when the fetch fails.
import { API_BASE, tooBig } from '@/lib/api';
import { sydneyToday } from '@/lib/format';
import { readPinsFromStorage } from '@/lib/pins';
import { getSettings, normalize } from '@/lib/settings';
import Storage from '@/lib/storage';
import type { Forecast, Fuel, Stations } from '@/lib/types';

import {
  FIX_KEY, type AppData, appDataUsable, compactForecast, compactStations, fromAppData, fuelKey, parseFix, type WidgetFix, isFresh, mergeSnapshot, modeKey, parseFuel, parseMode, type StationMode,
  type WidgetPrefs, type WidgetSnapshot,
} from './logic';

// v2: station prices carry the 7-day forecast: WPrice index 4, taken from stations.json StationPrice index 5. A v1
// cache from today would hide forecasts until tomorrow, so v1 is only read as a fallback (below), never written.
export const CACHE_KEY = 'widget.cache.v2';
export const OLD_CACHE_KEY = 'widget.cache.v1';
const SCHEMA = 1;
const TIMEOUT_MS = 15_000;

// The last parse of each key, reused while the stored text is unchanged: the snapshot is a few hundred KB, and a warm
// widget task (or the app) would otherwise re-parse it on every tap. Nothing mutates a parsed snapshot.
const parsed = new Map<string, { raw: string; v: WidgetSnapshot | null }>();

function readSnapshot(key: string): WidgetSnapshot | null {
  try {
    const raw = Storage.getItemSync(key);
    if (!raw) return null;
    const hit = parsed.get(key);
    if (hit?.raw === raw) return hit.v;
    const j = JSON.parse(raw) as WidgetSnapshot;
    const v = j && typeof j.fetchedAt === 'number' ? j : null;
    parsed.set(key, { raw, v });
    return v;
  } catch {
    return null;
  }
}

/** The cached snapshot; before the first v2 write (just after the OTA), the v1 one, so an offline widget still shows
 *  yesterday's data. v1 prices are 4-item tuples with no forecast, which render as "no forecast". */
export const readCache = (): WidgetSnapshot | null => readSnapshot(CACHE_KEY) ?? readSnapshot(OLD_CACHE_KEY);

let oldCacheGone = false;

/** Async write: the stations part is ~900 entries, so keep it off the UI thread. */
async function writeCache(s: WidgetSnapshot) {
  try {
    const raw = JSON.stringify(s);
    await Storage.setItem(CACHE_KEY, raw);
    parsed.set(CACHE_KEY, { raw, v: s });
    if (!oldCacheGone) {
      await Storage.removeItem(OLD_CACHE_KEY);   // the pre-forecast cache, if any (once per run)
      parsed.delete(OLD_CACHE_KEY);
      oldCacheGone = true;
    }
  } catch {
    // the widget still renders this time; the next refresh tries again
  }
}

async function getJson<T extends { schema: number }>(name: string): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/${name}.json`, { headers: { Accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
    if (tooBig(r)) throw new Error(`${name}.json: too large`);
    const j = (await r.json()) as T;
    if (j.schema !== SCHEMA) throw new Error(`${name}.json: schema ${j.schema}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

// ---- the app registers its query cache here (src/widget/sync.ts), so in-app refreshes don't refetch. `updatedAt` is
// when the app got the data (react-query dataUpdatedAt): without it the widget can't tell the morning's data from the
// afternoon run's, so it treats app data as older than its cache and fetches for itself.
let appData: (() => AppData) | null = null;
let lastApp: { prev: WidgetSnapshot | null; f?: Forecast; s?: Stations; at?: number; today: string; out: ReturnType<typeof fromAppData> } | null = null;
export function setWidgetDataSource(fn: (() => AppData) | null) {
  appData = fn;
  lastApp = null;
}

// fromAppData compacts ~900 stations; while the app is alive every widget redraw would redo it. The inputs are the
// same objects until the app refetches or the cache changes (readCache reuses its parse), so keep the last result.

function appSnapshot(prev: WidgetSnapshot | null, today: string, now: number) {
  const data = appData?.();
  const f = data?.forecast, s = data?.stations, at = data?.updatedAt;
  const hit = lastApp && lastApp.prev === prev && lastApp.f === f && lastApp.s === s && lastApp.at === at && lastApp.today === today;
  const out = hit ? lastApp!.out : fromAppData(prev, data, today, now);
  if (!hit) lastApp = { prev, f, s, at, today, out };
  return out && { ...out, use: appDataUsable(out.todays, out.at, now) };   // `use` ages with the clock, so not cached
}

/**
 * The best snapshot available: the app's data if it's today's, newer than the cache and under 2 h old, else the cache
 * if it's today's and under 2 h old (or any data under 30 min old: logic.ts isFresh), else a fetch. A failed fetch falls back to the cache (null only if nothing was ever loaded).
 */
export async function loadSnapshot(opts: { allowFetch: boolean }): Promise<WidgetSnapshot | null> {
  const now = Date.now();
  const today = sydneyToday();
  let cache = readCache();
  const app = appSnapshot(cache, today, now);
  if (app) {
    if (app.changed) await writeCache(app.snap);
    if (app.use) return app.snap;
    cache = app.snap;
  }
  if (!opts.allowFetch || isFresh(cache, today, now)) return cache;
  const [f, st] = await Promise.allSettled([getJson<Forecast>('forecast'), getJson<Stations>('stations')]);
  const next = {
    forecast: f.status === 'fulfilled' ? compactForecast(f.value) : null,
    stations: st.status === 'fulfilled' ? compactStations(st.value) : null,
  };
  if (!next.forecast && !next.stations) return cache;
  const s = mergeSnapshot(cache, next, now);
  await writeCache(s);
  return s;
}

/** Fuel, area, members setting and discounts as saved by the app (read fresh: the widget task may outlive app changes). */
export function readPrefs(): WidgetPrefs {
  let s = getSettings();
  try {
    const raw = Storage.getItemSync('settings.v1');
    if (raw) s = normalize(JSON.parse(raw));
  } catch {
    // fall back to the in-memory settings
  }
  return { fuel: s.fuel, home: s.home, radiusKm: s.radiusKm, members: s.members, discounts: s.discounts };
}

export const readPins = () => readPinsFromStorage();

// ---- per-widget choices: the medium widget's list mode and each widget's fuel, saved under the widget id
// (src/widget/logic.ts resolveMode / resolveFuel apply the defaults)

function readKey(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

async function saveKey(key: string, value: string) {
  try {
    await Storage.setItem(key, value);
  } catch {
    // not saved: this tap still draws the tapped choice (the handler passes it to modelFor), but the next redraw
    // falls back to the previously saved or default one
  }
}

async function clearKey(key: string) {
  try {
    await Storage.removeItem(key);
  } catch {
    // a stray key for a deleted widget is harmless
  }
}

export const readMode = (widgetId: number): StationMode | null => parseMode(readKey(modeKey(widgetId)));
export const saveMode = (widgetId: number, mode: StationMode) => saveKey(modeKey(widgetId), mode);
export const readFuel = (widgetId: number): Fuel | null => parseFuel(readKey(fuelKey(widgetId)));
/** Save the widget's fuel; tapping back to the app's own fuel removes it, so the widget follows the app again. */
export const saveFuel = (widgetId: number, fuel: Fuel) =>
  fuel === readPrefs().fuel ? clearKey(fuelKey(widgetId)) : saveKey(fuelKey(widgetId), fuel);

/** The widget's last location fix (shared by all widgets: it's where the phone is). */
export function readFix(): WidgetFix | null {
  try {
    const raw = Storage.getItemSync(FIX_KEY);
    return raw ? parseFix(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export const saveFix = (fix: WidgetFix) => saveKey(FIX_KEY, JSON.stringify(fix));
/** Forget the fix (permission withdrawn, or the user typed a suburb), so coordinates don't linger on the phone. */
export const clearFix = () => clearKey(FIX_KEY);

/** A removed widget's saved mode and fuel. */
export async function clearWidget(widgetId: number) {
  await Promise.all([clearKey(modeKey(widgetId)), clearKey(fuelKey(widgetId))]);
}
