// Pure logic for the Android home-screen widget: what the small and medium widgets say and which stations they list.
// No React Native or widget-library imports here, so it runs under jest and on every platform.
import { km, type Place } from '@/lib/geo';
import { addDays, nice } from '@/lib/format';
import { dayLabel, riseDay, toneOf, type Tone } from '@/lib/outlook';
import type { AdviceCode, Forecast, Fuel, LiveRow, Station, Stations } from '@/lib/types';

/** Prices older than this many days are not "fresh" (same rule as the Stations list and Today's "Best near you"). */
export const STALE_DAYS = 7;
export const MAX_ROWS = 3;
/** Deep links: the scheme stays `fuelforecast` (see BOWSER_PLAN §1). */
export const TODAY_URI = 'fuelforecast://';
export const stationUri = (id: string) => `fuelforecast://station/${encodeURIComponent(id)}`;

const ADVICE_TONE: Record<AdviceCode, Tone> = { now: 'act', by: 'act', wait: 'wait', hi: 'wait', any: 'calm', ok: 'calm', chk: 'calm' };
const FUEL_SHORT: Record<Fuel, string> = { U91: 'U91', E10: 'E10', P98: 'P98', DL: 'Diesel' };

// ---- the cached snapshot (a compact copy of forecast.json + stations.json kept on the phone for offline renders)

/** [price c/L, days since update, advice code, advice label] — StationPrice without the long reason text */
export type WPrice = [number, number | null, AdviceCode, string];
export type WStation = { id: string; n: string; la: number; lo: number; m: 0 | 1; p: Partial<Record<Fuel, WPrice>> };
export type WidgetSnapshot = {
  forecast: { asof: string; live: LiveRow[] } | null;
  stations: { asof: string; stations: WStation[] } | null;
  fetchedAt: number;   // ms epoch of the newest part
};

export function compactForecast(f: Forecast): NonNullable<WidgetSnapshot['forecast']> {
  return { asof: f.asof, live: f.live };
}

export function compactStations(s: Stations): NonNullable<WidgetSnapshot['stations']> {
  return {
    asof: s.asof,
    stations: s.stations
      .filter((x) => x.id)
      .map((x: Station) => {
        const p: Partial<Record<Fuel, WPrice>> = {};
        for (const [f, v] of Object.entries(x.p) as [Fuel, Station['p'][Fuel]][]) if (v) p[f] = [v[0], v[1], v[2], v[3]];
        return { id: String(x.id), n: x.n, la: x.la, lo: x.lo, m: x.m, p };
      }),
  };
}

/** Is a snapshot good enough to render without fetching? Today's data, or fetched in the last `maxAgeMs`. */
export function isFresh(s: WidgetSnapshot | null, today: string, now: number, maxAgeMs = 30 * 60 * 1000): boolean {
  if (!s?.forecast || !s.stations) return false;
  if (s.forecast.asof >= today && s.stations.asof >= today) return true;
  return now - s.fetchedAt < maxAgeMs;
}

/** Merge newer parts over a snapshot (a part is only replaced by the same or a newer day). */
export function mergeSnapshot(
  prev: WidgetSnapshot | null, next: Partial<Pick<WidgetSnapshot, 'forecast' | 'stations'>>, fetchedAt: number,
): WidgetSnapshot {
  const pick = <T extends { asof: string }>(a: T | null | undefined, b: T | null | undefined) =>
    b && (!a || b.asof >= a.asof) ? b : (a ?? null);
  return { forecast: pick(prev?.forecast, next.forecast), stations: pick(prev?.stations, next.stations), fetchedAt };
}

/**
 * The app's in-memory query data, folded into the cache. `use` is true only when both files are today's: an app left
 * in the background still holds yesterday's data, which must not stop the widget fetching. The cache's fetchedAt is
 * kept (app data is not a fetch), so the 30-minute freshness rule still applies to stale data.
 */
export function fromAppData(
  prev: WidgetSnapshot | null, app: { forecast?: Forecast; stations?: Stations } | null | undefined, today: string,
): { snap: WidgetSnapshot; changed: boolean; use: boolean } | null {
  if (!app?.forecast && !app?.stations) return null;
  const f = app.forecast ? compactForecast(app.forecast) : null;
  const s = app.stations ? compactStations(app.stations) : null;
  const snap = mergeSnapshot(prev, { forecast: f, stations: s }, prev?.fetchedAt ?? 0);
  const changed = !prev || snap.forecast?.asof !== prev.forecast?.asof || snap.stations?.asof !== prev.stations?.asof;
  const use = !!f && !!s && f.asof >= today && s.asof >= today;
  return { snap, changed, use };
}

// ---- what the widget shows

export type WidgetPrefs = { fuel: Fuel; home: Place | null; radiusKm: number; members: boolean };

export type NoteTone = 'cheap' | 'dear' | 'flat' | Tone;
export type WidgetRow = { id: string; name: string; price: string; note: string; noteTone: NoteTone; uri: string; a11y: string };

export type ListMode = 'pinned' | 'nearby' | 'no-area' | 'none-nearby' | 'no-data';

export type WidgetModel = {
  fuel: string;                 // short fuel label, "U91"
  tone: Tone;
  head: string;                 // verdict headline, or a prompt when there is no data
  rise: string | null;          // "Likely to rise from Sat 24 Oct"
  asOf: string | null;          // "as of 20 Oct" when the data isn't today's (Sydney date)
  mode: ListMode;
  caption: string | null;       // "Your stations" / "Cheapest near Parramatta 2150"
  rows: WidgetRow[];
  message: string | null;       // shown instead of rows
};

/** The rise line, using the same rise-day rule as Today and the station chips (lib/outlook.ts riseDay). */
export function riseText(r: LiveRow, asof: string, today: string): string {
  const J = riseDay(r);
  if (J == null) return 'No rise expected in 14 days';
  const rd = addDays(asof, J);
  const act = toneOf(r.verdict.cls) === 'act';
  if (rd <= today) return act ? 'Prices likely rising now' : 'A jump is possible any day';
  const when = rd === addDays(today, 1) ? 'tomorrow' : dayLabel(rd);
  return act ? `Likely to rise from ${when}` : `Jump possible from ${when}`;
}

/** "as of 20 Oct" when the data is older than today's Sydney date, else null. */
export function asOfLabel(asof: string | null | undefined, today: string): string | null {
  if (!asof || asof >= today) return null;
  return `as of ${nice(asof, false)}`;
}

const cleanName = (n: string) => n.replace(/\s*\(members only\)/i, '').trim();

function gapNote(price: number, median: number | undefined, adv: WPrice): { note: string; noteTone: NoteTone } {
  if (median == null) return { note: adv[3], noteTone: ADVICE_TONE[adv[2]] ?? 'calm' };
  const gap = price - median;
  if (Math.abs(gap) < 0.05) return { note: 'at median', noteTone: 'flat' };
  return { note: `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}c`, noteTone: gap < 0 ? 'cheap' : 'dear' };
}

function toRow(s: WStation, fuel: Fuel, median: number | undefined): WidgetRow | null {
  const adv = s.p[fuel];
  if (!adv || adv[0] == null) return null;
  const name = cleanName(s.n);
  const stale = adv[1] != null && adv[1] > STALE_DAYS;
  const { note, noteTone } = stale ? { note: `${adv[1]} days old`, noteTone: 'flat' as const } : gapNote(adv[0], median, adv);
  return {
    id: s.id, name, price: adv[0].toFixed(1), note, noteTone, uri: stationUri(s.id),
    a11y: `${name}, ${adv[0].toFixed(1)} cents, ${note === 'at median' ? 'at the median' : note}`,
  };
}

/** Pinned stations selling the fuel (pin order), else the cheapest fresh stations near home, else a prompt. */
export function chooseRows(
  snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[], max = MAX_ROWS,
): Pick<WidgetModel, 'mode' | 'caption' | 'rows' | 'message'> {
  const list = snap?.stations?.stations;
  if (!list) return { mode: 'no-data', caption: null, rows: [], message: 'Open Bowser to load prices' };
  const median = snap?.forecast?.live.find((r) => r.fuel === prefs.fuel)?.now;

  if (pins.length) {
    const byId = new Map(list.map((s) => [s.id, s]));
    const rows = pins
      .map((id) => byId.get(id))
      .map((s) => (s ? toRow(s, prefs.fuel, median) : null))
      .filter((r): r is WidgetRow => r != null)
      .slice(0, max);
    if (rows.length) return { mode: 'pinned', caption: 'Your stations', rows, message: null };
  }

  const home = prefs.home;
  if (!home) return { mode: 'no-area', caption: null, rows: [], message: 'Open Bowser to set your area' };

  const near = list
    .map((s) => {
      const p = s.p[prefs.fuel];
      if (!p || p[0] == null || (!prefs.members && s.m)) return null;
      if (p[1] != null && p[1] > STALE_DAYS) return null;
      const d = km(home.la, home.lo, s.la, s.lo);
      return d > prefs.radiusKm ? null : { s, price: p[0], d };
    })
    .filter((x): x is { s: WStation; price: number; d: number } => x != null)
    .sort((a, b) => a.price - b.price || a.d - b.d)
    .slice(0, max)
    .map((x) => toRow(x.s, prefs.fuel, median)!);
  if (!near.length)
    return { mode: 'none-nearby', caption: null, rows: [], message: `No fresh ${FUEL_SHORT[prefs.fuel]} prices within ${prefs.radiusKm} km` };
  return { mode: 'nearby', caption: `Cheapest near ${home.label}`, rows: near, message: null };
}

/** Everything both widget sizes need. `today` is the Sydney calendar date (lib/format sydneyToday). */
export function buildModel(snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[], today: string, max = MAX_ROWS): WidgetModel {
  const fuel = FUEL_SHORT[prefs.fuel] ?? prefs.fuel;
  const f = snap?.forecast;
  const r = f?.live.find((x) => x.fuel === prefs.fuel);
  // Show the older of the two dates, so a stale stations file isn't hidden behind today's forecast
  const dates = [f?.asof, snap?.stations?.asof].filter((d): d is string => !!d).sort();
  const base = r && f
    ? { tone: toneOf(r.verdict.cls), head: r.verdict.head, rise: riseText(r, f.asof, today) }
    : { tone: 'calm' as Tone, head: 'Open Bowser', rise: "to load today's outlook" };
  return { fuel, ...base, asOf: asOfLabel(dates[0], today), ...chooseRows(snap, prefs, pins, max) };
}

/** How many station rows fit in the medium widget's height (dp). */
export function rowsThatFit(heightDp: number): { rows: number; caption: boolean } {
  const caption = heightDp >= 150;
  const avail = heightDp - 24 - 50 - (caption ? 16 : 0);
  return { rows: Math.max(1, Math.min(MAX_ROWS, Math.floor(avail / 24))), caption };
}
