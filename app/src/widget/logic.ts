// Pure logic for the Android home-screen widget: what the small and medium widgets say and which stations they list.
// No React Native or widget-library imports here, so it runs under jest and on every platform.
import { km, type Place } from '@/lib/geo';
import { addDays, nice, stationName } from '@/lib/format';
import { dayLabel, riseDay, toneOf, type Tone } from '@/lib/outlook';
import type { AdviceCode, Forecast, Fuel, LiveRow, Station, Stations } from '@/lib/types';

/** Prices older than this many days are not "fresh" (same rule as the Stations list and Today's "Best near you"). */
export const STALE_DAYS = 7;
/** Stations in the medium widget's scrollable list: every pin (lib/pins.ts MAX_PINS = 10), or the top 10 nearby. */
export const MAX_ROWS = 10;
/** Deep links: the scheme stays `fuelforecast` (see BOWSER_PLAN §1). */
export const TODAY_URI = 'fuelforecast://';
export const stationUri = (id: string) => `fuelforecast://station/${encodeURIComponent(id)}`;

const ADVICE_TONE: Record<AdviceCode, Tone> = { now: 'act', by: 'act', wait: 'wait', hi: 'wait', any: 'calm', ok: 'calm', chk: 'calm' };
const FUEL_SHORT: Record<Fuel, string> = { U91: 'U91', E10: 'E10', P98: 'P98', DL: 'Diesel' };

// ---- the cached snapshot (a compact copy of forecast.json + stations.json kept on the phone for offline renders)

/** [price c/L, days since update, advice code, advice label, 7-day forecast c/L or null] — StationPrice without the
 *  long reason text. The forecast is stations.json index 5, which older files (and fail-soft days) don't have. */
export type WPrice = [number, number | null, AdviceCode, string, number | null];
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
        for (const [f, v] of Object.entries(x.p) as [Fuel, Station['p'][Fuel]][]) {
          if (!v) continue;
          const fc = (v as readonly unknown[])[5];
          p[f] = [v[0], v[1], v[2], v[3], typeof fc === 'number' && Number.isFinite(fc) ? fc : null];
        }
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
export type WidgetRow = {
  id: string; name: string; price: string; uri: string; a11y: string;
  advice: string;               // line 2 left: "Fill by Fri"
  adviceTone: Tone;
  dist: string | null;          // "1.2 km" in Nearest mode, after the advice on two-line rows only
  note: string;                 // the mode's note (gap, distance or age): line 2 right when there's no forecast
  noteTone: NoteTone;
  fc: string | null;            // line 2 right: "→ 237.4", the station's 7-day forecast (null when the data has none)
  fcTone: NoteTone;
};

export type ListMode = 'pinned' | 'nearby' | 'nearest' | 'no-pins' | 'no-area' | 'none-nearby' | 'no-data';

export type WidgetModel = {
  fuel: string;                 // short fuel label, "U91"
  fuelCode: Fuel;               // the fuel this widget shows
  nextFuel: Fuel;               // what a tap on the fuel chip switches to
  tone: Tone;
  head: string;                 // verdict headline, or a prompt when there is no data
  rise: string | null;          // "Likely to rise from Sat 24 Oct"
  riseShort: string | null;     // "Rise from Sat", when the full line won't fit
  sydney: { long: string; mid: string; short: string; tone: NoteTone } | null;   // "237.9 now → 240.4 in 7 days", "237.9 → 240.4 in 7 days", "237.9 → 240.4"
  asOf: string | null;          // "as of 20 Oct" when the data isn't today's (Sydney date)
  stationMode: StationMode | null;   // the medium widget's selected mode row tab (null for the small widget)
  canLocate: boolean;           // show the ⟳ (LOCATE) button: background location granted and the area is GPS or unset
  mode: ListMode;
  caption: string | null;       // "Near Parramatta 2150" (none for pinned: the mode row says it)
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

/** The rise line in a few words, for the compact small widget: "Rise from Sat", "Jump possible Sat". */
export function riseShort(r: LiveRow, asof: string, today: string): string {
  const J = riseDay(r);
  if (J == null) return 'No rise in 14 days';
  const rd = addDays(asof, J);
  const act = toneOf(r.verdict.cls) === 'act';
  if (rd <= today) return act ? 'Rising now' : 'Jump possible now';
  const when = rd === addDays(today, 1) ? 'tomorrow' : dayLabel(rd).split(' ')[0];
  return act ? `Rise from ${when}` : `Jump possible ${when}`;
}

/** "as of 20 Oct" when the data is older than today's Sydney date, else null. */
export function asOfLabel(asof: string | null | undefined, today: string): string | null {
  if (!asof || asof >= today) return null;
  return `as of ${nice(asof, false)}`;
}


function gapNote(price: number, median: number | undefined, adv: WPrice): { note: string; noteTone: NoteTone } {
  // No median: nothing to compare with (the advice is already on the left line), so the note stays blank
  if (median == null) return { note: '', noteTone: 'flat' };
  const gap = price - median;
  if (Math.abs(gap) < 0.05) return { note: 'at median', noteTone: 'flat' };
  return { note: `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}c`, noteTone: gap < 0 ? 'cheap' : 'dear' };
}

/** "Fill by Fri 23 Oct" -> "Fill by Fri" (the date doesn't fit a widget row); other labels unchanged. */
export const shortAdvice = (label: string) => label.replace(/^(Fill by \S+)\s+\d{1,2}\s+\S+$/, '$1').trim();

/** Colour for a forecast vs now: dear if it rises by 0.5c or more, cheap if it falls by 0.5c or more, else muted. */
export const fcTone = (now: number, fc: number): NoteTone => (fc - now >= 0.5 ? 'dear' : now - fc >= 0.5 ? 'cheap' : 'flat');

function toRow(s: WStation, fuel: Fuel, median: number | undefined): WidgetRow | null {
  const adv = s.p[fuel];
  if (!adv || adv[0] == null) return null;
  const name = stationName(s.n);
  const stale = adv[1] != null && adv[1] > STALE_DAYS;
  const { note, noteTone } = stale ? { note: `${adv[1]} days old`, noteTone: 'flat' as const } : gapNote(adv[0], median, adv);
  const f7 = typeof adv[4] === 'number' && Number.isFinite(adv[4]) ? adv[4] : null;
  // A stale price's age matters more than its forecast, so it keeps the "N days old" note
  const fc = f7 != null && !stale ? `→ ${f7.toFixed(1)}` : null;
  const advice = shortAdvice(adv[3]);
  return {
    id: s.id, name, price: adv[0].toFixed(1), uri: stationUri(s.id),
    advice, adviceTone: ADVICE_TONE[adv[2]] ?? 'calm', dist: null,
    note, noteTone,
    fc, fcTone: fc ? fcTone(adv[0], f7!) : 'flat',
    a11y: `${name}, ${adv[0].toFixed(1)} cents, ${advice}${fc ? `, ${f7!.toFixed(1)} in 7 days` : note ? `, ${note === 'at median' ? 'at the median' : note}` : ''}`,
  };
}

// ---- the medium widget's list mode (Pinned · Nearest · Cheapest), chosen per widget from the mode row

export type StationMode = 'pinned' | 'nearest' | 'cheapest';
export const STATION_MODES: readonly [StationMode, string][] = [['pinned', 'Pinned'], ['nearest', 'Nearest'], ['cheapest', 'Cheapest']];
/** Custom click action the mode row sends (clickActionData: { mode }). */
export const MODE_ACTION = 'MODE';
export const modeKey = (widgetId: number) => `widget.mode.${widgetId}`;

export const parseMode = (v: unknown): StationMode | null =>
  STATION_MODES.some(([m]) => m === v) ? (v as StationMode) : null;

/**
 * The widget's saved mode, else Pinned when at least one pin has a price for the user's fuel, else Cheapest (so a
 * 0.3.0 widget whose pins don't sell the fuel keeps showing the cheapest nearby, as it did). The default isn't
 * saved, so a widget the user never switched follows their pins.
 */
export function resolveMode(saved: unknown, snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[]): StationMode {
  const m = parseMode(saved);
  if (m) return m;
  const list = snap?.stations?.stations;
  return list && pins.length && pinnedRows(list, prefs, pins, undefined, 1).length ? 'pinned' : 'cheapest';
}

type Rows = Pick<WidgetModel, 'mode' | 'caption' | 'rows' | 'message'>;

function pinnedRows(list: WStation[], prefs: WidgetPrefs, pins: string[], median: number | undefined, max: number): WidgetRow[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  return pins
    .map((id) => byId.get(id))
    .map((s) => (s ? toRow(s, prefs.fuel, median) : null))
    .filter((r): r is WidgetRow => r != null)
    .slice(0, max);
}

/** Fresh stations selling the fuel within the radius of home, respecting members; cheapest or nearest first. */
function areaRows(list: WStation[], prefs: WidgetPrefs, home: Place, sort: 'price' | 'distance', median: number | undefined, max: number) {
  return list
    .map((s) => {
      const p = s.p[prefs.fuel];
      if (!p || p[0] == null || (!prefs.members && s.m)) return null;
      if (p[1] != null && p[1] > STALE_DAYS) return null;
      const d = km(home.la, home.lo, s.la, s.lo);
      return d > prefs.radiusKm ? null : { s, price: p[0], d };
    })
    .filter((x): x is { s: WStation; price: number; d: number } => x != null)
    .sort(sort === 'price' ? (a, b) => a.price - b.price || a.d - b.d : (a, b) => a.d - b.d || a.price - b.price)
    .slice(0, max)
    .map((x) => {
      const r = toRow(x.s, prefs.fuel, median)!;
      if (sort === 'price') return r;
      // Nearest: the distance follows the advice on two-line rows; the right keeps the forecast, or the gap
      const dist = `${x.d.toFixed(1)} km`;
      return { ...r, dist, a11y: `${r.a11y}, ${dist} away` };
    });
}

/**
 * The station list. With a `mode` (the medium widget): exactly that mode. Without one: pinned stations, else the
 * cheapest near home (the behaviour before the mode row).
 */
export function chooseRows(
  snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[], max = MAX_ROWS, mode?: StationMode,
): Rows {
  const list = snap?.stations?.stations;
  if (!list) return { mode: 'no-data', caption: null, rows: [], message: 'Open Bowser to load prices' };
  const median = snap?.forecast?.live.find((r) => r.fuel === prefs.fuel)?.now;
  const fuel = FUEL_SHORT[prefs.fuel];

  if (mode === 'pinned' || (!mode && pins.length)) {
    const rows = pinnedRows(list, prefs, pins, median, max);
    if (rows.length) return { mode: 'pinned', caption: null, rows, message: null };   // the mode row says Pinned
    if (mode === 'pinned')
      return pins.length
        ? { mode: 'no-pins', caption: null, rows: [], message: `Your pinned stations don't list ${fuel}` }
        : { mode: 'no-pins', caption: null, rows: [], message: 'No pinned stations. Pin one in Bowser' };
  }

  const home = prefs.home;
  if (!home) return { mode: 'no-area', caption: null, rows: [], message: 'Open Bowser to set your area' };
  const nearest = mode === 'nearest';
  const rows = areaRows(list, prefs, home, nearest ? 'distance' : 'price', median, max);
  if (!rows.length) return { mode: 'none-nearby', caption: null, rows: [], message: `No fresh ${fuel} prices within ${prefs.radiusKm} km` };
  return nearest
    ? { mode: 'nearest', caption: `Near ${home.label}`, rows, message: null }   // the mode row already says Nearest/Cheapest
    : { mode: 'nearby', caption: `Near ${home.label}`, rows, message: null };
}

/** The Sydney median now and in 7 days for the widget's fuel (forecast.live now, now + d7). */
export function sydneyForecast(r: LiveRow): WidgetModel['sydney'] {
  if (!Number.isFinite(r.now) || !Number.isFinite(r.d7)) return null;
  const a = r.now.toFixed(1), b = (r.now + r.d7).toFixed(1);
  return { long: `${a} now → ${b} in 7 days`, mid: `${a} → ${b} in 7 days`, short: `${a} → ${b}`, tone: fcTone(r.now, r.now + r.d7) };
}

/** Everything both widget sizes need. `today` is the Sydney calendar date (lib/format sydneyToday).
 *  `mode` is the medium widget's list mode (resolveMode); the small widget leaves it out. */
export function buildModel(
  snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[], today: string, max = MAX_ROWS, mode?: StationMode,
): WidgetModel {
  const fuel = fuelLabel(prefs.fuel);
  const f = snap?.forecast;
  const r = f?.live.find((x) => x.fuel === prefs.fuel);
  // Show the older of the two dates, so a stale stations file isn't hidden behind today's forecast
  const dates = [f?.asof, snap?.stations?.asof].filter((d): d is string => !!d).sort();
  const base = r && f
    ? { tone: toneOf(r.verdict.cls), head: r.verdict.head, rise: riseText(r, f.asof, today), riseShort: riseShort(r, f.asof, today), sydney: sydneyForecast(r) }
    : f
      ? { tone: 'calm' as Tone, head: `No outlook for ${fuel}`, rise: null, riseShort: null, sydney: null }
      : { tone: 'calm' as Tone, head: 'Open Bowser', rise: "to load today's outlook", riseShort: 'to load prices', sydney: null };
  return { fuel, fuelCode: prefs.fuel, nextFuel: nextFuel(prefs.fuel), canLocate: false, ...base, asOf: asOfLabel(dates[0], today), stationMode: mode ?? null, ...chooseRows(snap, prefs, pins, max, mode) };
}

// ---- layout budgets. widgets.tsx draws with exactly these sizes; all widget text has allowFontScaling={false}.

/** Height of one line of text at `sp` (not font-scaled): Roboto with Android's default font padding is ~1.33 em. */
export const lineH = (sp: number) => Math.ceil(sp * 1.33);

/** Medium widget styles (dp / sp) */
export const MED = {
  pad: 10, padH: 10, padV: 7, padVCompact: 4, mark: 22, markCompact: 18, chip: 26, chipCompact: 22,
  head: 15, headCompact: 14, sub: 11, asOf: 10, modes: 28, modesCompact: 22, modeGap: 4, listGap: 2, caption: 10, captionGap: 4,
} as const;
/** Station row styles: two lines (name / advice, price / forecast); one line in the compact layout */
export const ROW = { padV: 4, name: 13, sub: 11, price: 14 } as const;
/** Small widget styles, regular and compact (the 110 dp minimum) */
export const SMALL_STYLE = {
  regular: { pad: 14, chip: 30, mark: 24, head: 18, sub: 12, gap: 4 },
  compact: { pad: 10, chip: 24, mark: 20, head: 13, sub: 10, gap: 1 },
} as const;

/**
 * The medium widget's fixed block above the station list, in dp, measured from MED (lineH: 15 sp 20, 14 sp 19,
 * 11 sp 15, 10 sp 14):
 *   compact: padding 10+10, header 4 + max(mark 18, headline 19, chip 22) + 4, mode row 4+22, list gap 2 = 78 -> 80
 *   regular: padding 10+10, header 7 + max(headline 20 + rise 15 + forecast 15 = 50, chip 26 + "as of" 14) + 7,
 *            mode row 4+28, list gap 2 = 118 -> 122
 *   caption: gap 4 + 10 sp line 14 = 18
 * Budgets are measured + 2..4 dp spare, so the list never runs past the bottom edge.
 */
export const MEDIUM_FIXED = { compact: 80, regular: 122, caption: 18 } as const;
/** One list item: 4+4 padding around (13 sp name 18 + 11 sp advice 15 = 33 | 14 sp price 19 + 11 sp forecast 15 = 34)
 *  = 42 -> 44 two-line (2 dp headroom for OEM fonts); 4+4 around a 19 dp line = 27 -> 28 one-line (compact). */
export const LIST_ROW_H = { two: 44, one: 28 } as const;
/** Never draw a list shorter than one full row of its layout (a ListWidget under ~1 dp throws natively and blanks the
 *  widget; under a row it's just a sliver). */
export const MIN_LIST_H = LIST_ROW_H;
/** Below this the medium widget uses the compact header and one-line rows: regular needs 122 + one 44 dp row. */
export const MEDIUM_COMPACT_BELOW = MEDIUM_FIXED.regular + LIST_ROW_H.two;   // 166

/**
 * The medium widget's layout for its height (dp): compact header and one-line rows below 166 dp (the 110 dp minimum
 * included), a caption once there is room, and the station list's height. `listH` is null when the list must not be
 * drawn (shorter than one row, or an unknown 0 height): the widget then shows the first row as a plain row instead.
 * Otherwise the list is only as tall as its rows, so taps below a short list reach the "open Today" area.
 */
export function mediumLayout(heightDp: number, rows = 0, hasCaption = true): { compact: boolean; caption: boolean; rowH: number; listH: number | null } {
  const compact = !(heightDp >= MEDIUM_COMPACT_BELOW);
  const caption = hasCaption && heightDp >= 190;   // pinned mode has no caption, so its rows get the room
  const rowH = compact ? LIST_ROW_H.one : LIST_ROW_H.two;
  const room = Math.floor(heightDp - (compact ? MEDIUM_FIXED.compact : MEDIUM_FIXED.regular) - (caption ? MEDIUM_FIXED.caption : 0));
  const listH = Math.min(room, Math.max(rows, 1) * rowH);
  return { compact, caption, rowH, listH: Number.isFinite(listH) && listH >= rowH ? listH : null };
}

/**
 * The small widget at its size: compact below 150 dp either way (the 110 dp minimum included).
 *   compact: padding 10+10, chip 24, headline 2 x 13 sp (2 x 18), gap 1, rise 10 sp 14, forecast 10 sp 14 = 107 <= 110
 *   regular: padding 14+14, chip 30, headline 2 x 18 sp (2 x 24), gap 4, rise 12 sp 16, gap 2, forecast 12 sp 16 = 144 <= 150
 */
export const SMALL_COMPACT_BELOW = 150;
export const smallCompact = (w: number, h: number) => !(w >= SMALL_COMPACT_BELOW && h >= SMALL_COMPACT_BELOW);
export function smallHeight(compact: boolean): number {
  const s = compact ? SMALL_STYLE.compact : SMALL_STYLE.regular;
  return 2 * s.pad + Math.max(s.chip, s.mark) + 2 * lineH(s.head) + s.gap + lineH(s.sub) + (compact ? 0 : 2) + lineH(s.sub);
}

// ---- fitting text without measuring it: a conservative average glyph width (bold digits/caps ~0.6 em)

const AVG_EM = 0.6;
/** Does `text` fit on one line `widthDp` wide at `sp`? Errs towards "no". */
export const fitsLine = (text: string, widthDp: number, sp: number) => text.length * sp * AVG_EM <= widthDp;
/** The first candidate that fits, else the last one (callers end with the must-show text). */
export const firstFit = (candidates: string[], widthDp: number, sp: number) =>
  candidates.find((c) => fitsLine(c, widthDp, sp)) ?? candidates[candidates.length - 1];

/** Width of the fuel chip: 10+10 padding around "Diesel ▾" etc. at 12 sp */
export const chipW = (m: Pick<WidgetModel, 'fuel'>) => 20 + `${m.fuel} ▾`.length * 12 * AVG_EM;

/** Compact medium headline: the verdict, then "as of", then the Sydney forecast, each only if it fits. */
export function compactHeadline(m: Pick<WidgetModel, 'head' | 'asOf' | 'sydney' | 'fuel'>, widthDp: number): string {
  const w = widthDp - 2 * MED.pad - 2 * MED.padH - MED.markCompact - 8 - 6 - chipW(m);
  const parts = [m.head, m.asOf, m.sydney?.short].filter((x): x is string => !!x);
  const cands = parts.map((_, i) => parts.slice(0, parts.length - i).join(' · '));
  return firstFit(cands, w, MED.headCompact);
}

/** Regular medium: the Sydney forecast line under the rise line (long form if it fits). */
export function mediumForecastLine(m: Pick<WidgetModel, 'sydney' | 'fuel'>, widthDp: number): string | null {
  if (!m.sydney) return null;
  const w = widthDp - 2 * MED.pad - 2 * MED.padH - MED.mark - 8 - 6 - chipW(m);
  return firstFit([m.sydney.long, m.sydney.mid, m.sydney.short], w, MED.sub);
}

/** Small: the rise line, or its short form when the full one won't fit. */
export function smallRiseLine(m: Pick<WidgetModel, 'rise' | 'riseShort'>, widthDp: number, compact: boolean): string | null {
  if (!m.rise) return null;
  const s = compact ? SMALL_STYLE.compact : SMALL_STYLE.regular;
  return firstFit(m.riseShort ? [m.rise, m.riseShort] : [m.rise], widthDp - 2 * s.pad, s.sub);
}

/**
 * Compact one-line rows (name | advice | price): the advice gets at most 40% of the space beside the price, so the
 * name keeps the larger share however long the advice is. Returns the advice width (dp) and what's left for the name.
 */
export function compactRowWidths(widthDp: number, advice: string): { adviceW: number; nameW: number } {
  const priceW = Math.ceil(5 * ROW.price * AVG_EM);   // "237.9"
  const avail = widthDp - 2 * MED.pad - 2 * 4 - 8 - 8 - priceW;   // widget + row padding, two 8 dp gaps
  const adviceW = Math.max(0, Math.min(Math.ceil(advice.length * ROW.sub * AVG_EM), Math.floor(avail * 0.4)));
  return { adviceW, nameW: Math.max(0, avail - adviceW) };
}

/** Small: the forecast line (with "as of" when the data is old), long form if it fits. */
export function smallForecastLine(m: Pick<WidgetModel, 'sydney' | 'asOf'>, widthDp: number, compact: boolean): string | null {
  const s = compact ? SMALL_STYLE.compact : SMALL_STYLE.regular;
  const w = widthDp - 2 * s.pad;
  const fc = m.sydney ? [m.sydney.long, m.sydney.mid, m.sydney.short] : [];
  const cands = m.asOf ? [...fc.map((x) => `${x} · ${m.asOf}`), m.asOf] : fc;
  return cands.length ? firstFit(cands, w, s.sub) : null;
}

// ---- where "near" is: the widget's live location, or the area saved in the app

/** The widget's last location fix, kept in kv so redraws without a new fix reuse it */
export type WidgetFix = { la: number; lo: number; at: number };
export const FIX_KEY = 'widget.loc';
/** A stored fix older than this isn't "where you are" any more; the saved area is used instead. */
export const FIX_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Custom click action the ⟳ button sends: get a fresh fix and redraw. */
export const LOCATE_ACTION = 'LOCATE';
/** Label for a live fix: the caption reads "Near you". */
export const LIVE_LABEL = 'you';

export const parseFix = (v: unknown): WidgetFix | null => {
  const f = v as WidgetFix | null;
  return f && typeof f === 'object' && [f.la, f.lo, f.at].every((x) => typeof x === 'number' && Number.isFinite(x)) ? f : null;
};

/**
 * The origin for Nearest, Cheapest and the no-pins fallback. A suburb the user typed is a deliberate choice and always
 * wins. Otherwise (GPS-based area, or none), when background location is granted, the widget's own fix (if under
 * 6 h old) is used, labelled "you"; failing that, the saved area. The widget never asks for permission.
 */
export function resolveOrigin(
  home: Place | null, bgGranted: boolean, fix: WidgetFix | null, now: number,
): { origin: Place | null; live: boolean; canLocate: boolean } {
  const typed = !!home && !home.gps;
  const canLocate = bgGranted && !typed;
  if (canLocate && fix && now - fix.at >= 0 && now - fix.at <= FIX_MAX_AGE_MS)
    return { origin: { label: LIVE_LABEL, la: fix.la, lo: fix.lo, gps: true }, live: true, canLocate };
  return { origin: home, live: false, canLocate };
}

// ---- the per-widget fuel chip (tap cycles U91 -> E10 -> P98 -> DL -> U91)

export const FUEL_CYCLE: readonly Fuel[] = ['U91', 'E10', 'P98', 'DL'];
/** Custom click action the fuel chip sends (clickActionData: { fuel }, the fuel to switch to). */
export const FUEL_ACTION = 'FUEL';
export const fuelKey = (widgetId: number) => `widget.fuel.${widgetId}`;
export const fuelLabel = (f: Fuel) => FUEL_SHORT[f] ?? f;
export const parseFuel = (v: unknown): Fuel | null => (FUEL_CYCLE.includes(v as Fuel) ? (v as Fuel) : null);
export const nextFuel = (f: Fuel): Fuel => FUEL_CYCLE[(FUEL_CYCLE.indexOf(f) + 1) % FUEL_CYCLE.length];
/** The widget's own fuel once the user has tapped the chip, else the app's settings fuel. */
export const resolveFuel = (saved: unknown, settingsFuel: Fuel): Fuel => parseFuel(saved) ?? settingsFuel;
