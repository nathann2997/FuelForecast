// Where the widget's data comes from: the app's own query cache when the app is running, otherwise the static API,
// with a compact copy kept on the phone so the widget can still render (with "as of") when the fetch fails.
import { API_BASE } from '@/lib/api';
import { sydneyToday } from '@/lib/format';
import { readPinsFromStorage } from '@/lib/pins';
import { getSettings, normalize } from '@/lib/settings';
import Storage from '@/lib/storage';
import type { Forecast, Stations } from '@/lib/types';

import {
  compactForecast, compactStations, fromAppData, isFresh, mergeSnapshot, modeKey, parseMode, type StationMode, type WidgetPrefs,
  type WidgetSnapshot,
} from './logic';

const CACHE_KEY = 'widget.cache.v1';
const SCHEMA = 1;
const TIMEOUT_MS = 15_000;

export function readCache(): WidgetSnapshot | null {
  try {
    const raw = Storage.getItemSync(CACHE_KEY);
    const v = raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
    return v && typeof v.fetchedAt === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Async write: the stations part is ~900 entries, so keep it off the UI thread. */
async function writeCache(s: WidgetSnapshot) {
  try {
    await Storage.setItem(CACHE_KEY, JSON.stringify(s));
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
    const j = (await r.json()) as T;
    if (j.schema !== SCHEMA) throw new Error(`${name}.json: schema ${j.schema}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

// ---- the app registers its query cache here (src/widget/sync.ts), so in-app refreshes don't refetch
type AppData = () => { forecast?: Forecast; stations?: Stations };
let appData: AppData | null = null;
export function setWidgetDataSource(fn: AppData | null) {
  appData = fn;
}

/**
 * The best snapshot available: app data if the app has it, else the cache if it's today's (or under 30 min old),
 * else a fetch. A failed fetch falls back to the cache (null only if nothing was ever loaded).
 */
export async function loadSnapshot(opts: { allowFetch: boolean }): Promise<WidgetSnapshot | null> {
  const now = Date.now();
  const today = sydneyToday();
  let cache = readCache();
  const app = fromAppData(cache, appData?.(), today);
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

/** Fuel, area and members setting as saved by the app (read fresh: the widget task may outlive app changes). */
export function readPrefs(): WidgetPrefs {
  let s = getSettings();
  try {
    const raw = Storage.getItemSync('settings.v1');
    if (raw) s = normalize(JSON.parse(raw));
  } catch {
    // fall back to the in-memory settings
  }
  return { fuel: s.fuel, home: s.home, radiusKm: s.radiusKm, members: s.members };
}

export const readPins = () => readPinsFromStorage();

// ---- the medium widget's list mode, saved per widget id (src/widget/logic.ts resolveMode applies the default)

export function readMode(widgetId: number): StationMode | null {
  try {
    return parseMode(Storage.getItemSync(modeKey(widgetId)));
  } catch {
    return null;
  }
}

export async function saveMode(widgetId: number, mode: StationMode) {
  try {
    await Storage.setItem(modeKey(widgetId), mode);
  } catch {
    // not saved: this tap still draws the tapped mode (the handler passes it to modelFor), but the next redraw
    // falls back to the previously saved or default mode
  }
}

export async function clearMode(widgetId: number) {
  try {
    await Storage.removeItem(modeKey(widgetId));
  } catch {
    // a stray key for a deleted widget is harmless
  }
}
