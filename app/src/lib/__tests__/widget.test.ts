import { describe, expect, it } from '@jest/globals';

import {
  LIST_ROW_H, MED, MEDIUM_FIXED, MEDIUM_COMPACT_BELOW, ROW, compactHeadline, compactRowWidths, riseShort, smallRiseLine, fcTone, firstFit, lineH, mediumForecastLine, shortAdvice,
  smallCompact, smallForecastLine, smallHeight, sydneyForecast,
} from '../../widget/logic';

import type { Place } from '../geo';
import type { Forecast, Station, Stations } from '../types';
import {
  asOfLabel, buildModel, chooseRows, compactForecast, compactStations, fromAppData, isFresh, mergeSnapshot, modeKey, parseMode, resolveMode, riseText, mediumLayout, fuelKey, nextFuel, parseFuel, resolveFuel, fuelLabel, MAX_ROWS,
  stationUri, TODAY_FRESH_MS,
  type WidgetPrefs, type WidgetSnapshot,
} from '../../widget/logic';
import fixture from './forecast.fixture.json';

const F = fixture as unknown as Forecast;
const U91 = F.live.find((r) => r.fuel === 'U91')!;   // "Fill up today", median 237.9, rise day 3 (Sat 24 Oct)
const P98 = F.live.find((r) => r.fuel === 'P98')!;   // "No rush either way"
const TODAY = '2026-10-21';

// Around Parramatta (-33.815, 151.003)
const home: Place = { label: 'Parramatta 2150', la: -33.815, lo: 151.003 };
const st = (id: string, n: string, u91: number | null, age: number | null, extra: Partial<Station> = {}): Station => ({
  id, n, b: 'Brand', s: 'Suburb', pc: 2150, la: -33.815, lo: 151.003, m: 0,
  p: u91 == null ? { DL: [280, 0, 'ok', 'Any time', 'r'] } : { U91: [u91, age, 'by', 'Fill by Fri', 'reason text'] },
  ...extra,
});
const STATIONS: Stations = {
  schema: 1, asof: TODAY, suburbs: [],
  stations: [
    st('1', 'Cheap Fresh', 229.9, 0),
    st('2', 'Cheap But Stale', 219.9, 12),
    st('3', 'Mid', 235.9, 1),
    st('4', 'Dear', 245.9, 0),
    st('5', 'Far Away', 209.9, 0, { la: -33.0, lo: 151.0 }),
    st('6', 'Members Club (Members Only)', 225.9, 0, { m: 1 }),
    st('7', 'Diesel Only', null, 0),
    st('8', 'At Median', 237.9, 2),
  ],
};
const snap = (over: Partial<WidgetSnapshot> = {}): WidgetSnapshot => ({
  forecast: compactForecast(F), stations: compactStations(STATIONS), fetchedAt: 0, ...over,
});
const prefs = (over: Partial<WidgetPrefs> = {}): WidgetPrefs => ({ fuel: 'U91', home, radiusKm: 5, members: true, ...over });

describe('widget verdict and rise text', () => {
  it('uses the same rise day as Today', () => {
    expect(riseText(U91, F.asof, TODAY)).toBe('Likely to rise from Sat 24 Oct');
    expect(riseText(U91, F.asof, '2026-10-23')).toBe('Likely to rise from tomorrow');
    expect(riseText(U91, F.asof, '2026-10-25')).toBe('Prices likely rising now');
  });
  it('is softer when the verdict is not to act, and says when no rise is expected', () => {
    expect(riseText({ ...P98, p_jump7: 0.6 }, F.asof, TODAY)).toMatch(/^Jump possible from /);
    expect(riseText({ ...P98, p_jump7: 0.01, d1: 0, d3: -1, d7: -2, d14: -3 }, F.asof, TODAY)).toBe('No rise expected in 14 days');
  });
  it('labels data older than today', () => {
    expect(asOfLabel(TODAY, TODAY)).toBeNull();
    expect(asOfLabel('2026-10-20', TODAY)).toBe('as of 20 Oct');
    expect(asOfLabel(null, TODAY)).toBeNull();
  });
  it('builds the model for the chosen fuel, with as-of from the older file', () => {
    const m = buildModel(snap(), prefs(), [], TODAY);
    expect(m).toMatchObject({ fuel: 'U91', tone: 'act', head: 'Fill up today', rise: 'Likely to rise from Sat 24 Oct', asOf: null });
    const old = snap();
    old.stations!.asof = '2026-10-19';
    expect(buildModel(old, prefs(), [], TODAY).asOf).toBe('as of 19 Oct');
    expect(buildModel(snap(), prefs({ fuel: 'DL' }), [], TODAY).fuel).toBe('Diesel');
  });
  it('says there is no outlook when the forecast has no row for the fuel', () => {
    const s = snap();
    s.forecast = { ...s.forecast!, live: s.forecast!.live.filter((r) => r.fuel !== 'E10') };
    expect(buildModel(s, prefs({ fuel: 'E10' }), [], TODAY)).toMatchObject({ head: 'No outlook for E10', rise: null, tone: 'calm' });
  });
  it('prompts to open the app with no data', () => {
    const m = buildModel(null, prefs(), [], TODAY);
    expect(m.head).toBe('Open Bowser');
    expect(m.mode).toBe('no-data');
  });
});

describe('widget station rows', () => {
  it('shows pinned stations first, in pin order, skipping pins without the fuel or no longer listed', () => {
    const r = chooseRows(snap(), prefs(), ['4', '7', 'gone', '1', '3', '8'], 3);
    expect(r.mode).toBe('pinned');
    expect(r.rows.map((x) => x.id)).toEqual(['4', '1', '3']);
    expect(r.rows[0]).toMatchObject({ price: '245.9', note: '+8.0c', noteTone: 'dear', uri: 'fuelforecast://station/4' });
    expect(r.rows[1]).toMatchObject({ note: '−8.0c', noteTone: 'cheap' });
  });
  it('pinned rows have no caption (the mode row says Pinned) and tidy ALL-CAPS names', () => {
    const r = chooseRows(snap(), prefs(), ['8'], 3, 'pinned');
    expect(r.mode).toBe('pinned');
    expect(r.caption).toBeNull();
    const caps = { ...STATIONS, stations: [st('9', 'SHELL NORTH ROCKS', 230, 0)] };
    expect(chooseRows(snap({ stations: compactStations(caps) }), prefs(), ['9']).rows[0].name).toBe('Shell North Rocks');
  });
  it('gives pinned mode the caption row when there is no caption', () => {
    expect(mediumLayout(220, 10, false)).toEqual({ compact: false, caption: false, rowH: 44, listH: 98 });
  });
  it('shows a pinned stale price as its age, and "at median"', () => {
    expect(chooseRows(snap(), prefs(), ['2']).rows[0]).toMatchObject({ note: '12 days old', noteTone: 'flat' });
    expect(chooseRows(snap(), prefs(), ['8']).rows[0]).toMatchObject({ note: 'at median', noteTone: 'flat' });
  });
  it('falls back to the 3 cheapest fresh stations near home, respecting radius and members', () => {
    const r = chooseRows(snap(), prefs(), [], 3);
    expect(r.mode).toBe('nearby');
    expect(r.caption).toBe('Near Parramatta 2150');
    expect(r.rows.map((x) => x.id)).toEqual(['6', '1', '3']);
    expect(r.rows[0].name).toBe('Members Club');
    expect(chooseRows(snap(), prefs({ members: false }), [], 3).rows.map((x) => x.id)).toEqual(['1', '3', '8']);
    expect(chooseRows(snap(), prefs({ radiusKm: 200 }), []).rows[0].id).toBe('5');
  });
  it('falls back to nearby when no pin sells the fuel', () => {
    expect(chooseRows(snap(), prefs(), ['7']).mode).toBe('nearby');
  });
  it('prompts to set an area with no pins and no home', () => {
    const r = chooseRows(snap(), prefs({ home: null }), []);
    expect(r).toMatchObject({ mode: 'no-area', rows: [], message: 'Open Bowser to set your area' });
  });
  it('says so when nothing fresh is nearby', () => {
    const r = chooseRows(snap(), prefs({ fuel: 'P98' }), []);
    expect(r.mode).toBe('none-nearby');
    expect(r.message).toBe('No fresh P98 prices within 5 km');
  });
  it('leaves the note blank with no median and no forecast (the advice is already on the left), but keeps a stale age', () => {
    const s = snap({ forecast: null });
    expect(chooseRows(s, prefs(), ['1']).rows[0]).toMatchObject({ note: '', fc: null, advice: 'Fill by Fri' });
    expect(chooseRows(s, prefs(), ['2']).rows[0]).toMatchObject({ note: '12 days old' });
  });
  it('encodes station ids in deep links', () => {
    expect(stationUri('12/3')).toBe('fuelforecast://station/12%2F3');
  });
});

describe('widget cache', () => {
  it('drops the long reason text and stations without an id', () => {
    const c = compactStations({ ...STATIONS, stations: [...STATIONS.stations, { ...st('x', 'No id', 230, 0), id: '' }] });
    expect(c.stations).toHaveLength(STATIONS.stations.length);
    expect(c.stations[0].p.U91).toEqual([229.9, 0, 'by', 'Fill by Fri', null]);   // no forecast in this file
  });
  it('is fresh when both files are today\'s and fetched in the last 2 h (the pipeline republishes during the day), or when fetched in the last 30 minutes', () => {
    const now = 1_000_000_000;
    expect(isFresh(snap({ fetchedAt: now - TODAY_FRESH_MS + 60_000 }), TODAY, now)).toBe(true);
    expect(isFresh(snap({ fetchedAt: now - TODAY_FRESH_MS }), TODAY, now)).toBe(false);   // the noon run may be out
    expect(isFresh(snap({ fetchedAt: 0 }), TODAY, now)).toBe(false);
    const old = snap({ fetchedAt: now - 60 * 60 * 1000 });
    old.forecast!.asof = '2026-10-20';
    expect(isFresh(old, TODAY, now)).toBe(false);
    expect(isFresh({ ...old, fetchedAt: now - 60_000 }, TODAY, now)).toBe(true);
    expect(isFresh(null, TODAY, now)).toBe(false);
  });
  it('compacts the medium header on a short widget', () => {
    // the list scrolls and fills whatever is left; only the header changes with height
    expect(mediumLayout(110, 3)).toEqual({ compact: true, caption: false, rowH: 28, listH: 30 });    // 110 - 80, one-line rows
    expect(mediumLayout(150, 10)).toEqual({ compact: true, caption: false, rowH: 28, listH: 70 });   // compact below 164: 150 - 80
    expect(mediumLayout(165, 10).compact).toBe(true);                                                // below 166
    expect(mediumLayout(166, 10)).toEqual({ compact: false, caption: false, rowH: 44, listH: 44 });  // 166 - 122: one two-line row
    expect(mediumLayout(180, 10)).toEqual({ compact: false, caption: false, rowH: 44, listH: 58 });
    expect(mediumLayout(220, 10)).toEqual({ compact: false, caption: true, rowH: 44, listH: 80 });   // 220 - 122 - 18
    // only as tall as the rows, so taps below a short list reach "open Today"
    expect(mediumLayout(400, 2).listH).toBe(88);
    expect(mediumLayout(400, 0).listH).toBe(44);
    // never a list under one row of its layout, nor for an unknown (0) or nonsense height
    for (const h of [0, 60, 80, 105, NaN, -5]) expect(mediumLayout(h, 3).listH).toBeNull();
  });
});

describe('widget data from the running app', () => {
  const YDAY = '2026-10-20';
  const yForecast = { ...F, asof: YDAY };
  const yStations = { ...STATIONS, asof: YDAY };
  it('ignores the app when it has no data', () => {
    expect(fromAppData(null, null, TODAY)).toBeNull();
    expect(fromAppData(null, {}, TODAY)).toBeNull();
  });
  it("uses the app's data only when both files are today's and the app loaded them under 2 h ago", () => {
    const now = 1_000_000_000;
    const r = fromAppData(null, { forecast: F, stations: STATIONS, updatedAt: now - 60_000 }, TODAY, now)!;
    expect(r.use).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.snap.fetchedAt).toBe(now - 60_000);   // the app's load time, so isFresh ages it like a widget fetch
    expect(fromAppData(null, { forecast: F, updatedAt: now }, TODAY, now)!.use).toBe(false);
    // a morning load in a backgrounded app must not hide the afternoon run (pipeline republishes during the day)
    expect(fromAppData(null, { forecast: F, stations: STATIONS, updatedAt: now - TODAY_FRESH_MS }, TODAY, now)!.use).toBe(false);
    // no load time (an app build without it): not usable, the widget fetches for itself
    expect(fromAppData(null, { forecast: F, stations: STATIONS }, TODAY, now)!.use).toBe(false);
  });
  it("keeps a same-day cache the widget fetched after the app's load", () => {
    const now = 1_000_000_000;
    const later = { ...compactForecast(F), live: [] };   // stands in for the afternoon run of the same day
    const cache = mergeSnapshot(null, { forecast: later, stations: compactStations(STATIONS) }, now - 60_000);
    const r = fromAppData(cache, { forecast: F, stations: STATIONS, updatedAt: now - 3600_000 }, TODAY, now)!;
    expect(r.use).toBe(false);
    expect(r.changed).toBe(false);
    expect(r.snap.forecast).toBe(cache.forecast);
    // and a newer app load replaces the same day's cache
    const r2 = fromAppData(cache, { forecast: F, stations: STATIONS, updatedAt: now - 1000 }, TODAY, now)!;
    expect(r2).toMatchObject({ use: true, changed: true });
    expect(r2.snap.forecast!.live).toEqual(F.live);
  });
  it("doesn't let a backgrounded app's stale query cache stop a fetch", () => {
    const now = 1_000_000_000;
    const cache = mergeSnapshot(null, { forecast: compactForecast(yForecast), stations: compactStations(yStations) }, now - 3 * 3600_000);
    const r = fromAppData(cache, { forecast: yForecast, stations: yStations }, TODAY)!;
    expect(r.use).toBe(false);
    expect(r.changed).toBe(false);
    // fetchedAt is not restamped from app data, so the snapshot is still due for a fetch
    expect(r.snap.fetchedAt).toBe(cache.fetchedAt);
    expect(isFresh(r.snap, TODAY, now)).toBe(false);
  });
  it('never replaces newer cached data with older app data', () => {
    const cache = mergeSnapshot(null, { forecast: compactForecast(F), stations: compactStations(STATIONS) }, 5);
    const r = fromAppData(cache, { forecast: yForecast, stations: yStations }, TODAY)!;
    expect(r.snap.forecast!.asof).toBe(TODAY);
    expect(r.changed).toBe(false);
    expect(r.snap.fetchedAt).toBe(5);
  });
  it('folds a newer app file into the cache without marking it fetched', () => {
    const cache = mergeSnapshot(null, { forecast: compactForecast(yForecast), stations: compactStations(yStations) }, 7);
    const r = fromAppData(cache, { forecast: F }, TODAY)!;
    expect(r).toMatchObject({ changed: true, use: false });
    expect(r.snap.forecast!.asof).toBe(TODAY);
    expect(r.snap.stations!.asof).toBe(YDAY);
    expect(r.snap.fetchedAt).toBe(7);
  });
});

describe('medium widget list modes', () => {
  // A line of stations north of home, 0.01° (~1.1 km) apart; prices not in distance order
  const at = (i: number) => ({ la: home.la + 0.01 * i, lo: home.lo });
  const LINE: Stations = {
    schema: 1, asof: TODAY, suburbs: [],
    stations: [
      st('a', 'A 1.1 km', 239.9, 0, at(1)),
      st('b', 'B 2.2 km', 229.9, 0, at(2)),
      st('c', 'C 3.3 km', 219.9, 0, at(3)),
      st('d', 'D 0 km stale', 199.9, 9, at(0)),
      st('e', 'E 4.4 km members', 209.9, 0, { ...at(4), m: 1 }),
      st('f', 'F 8.9 km too far', 189.9, 0, at(8)),
    ],
  };
  const s = snap({ stations: compactStations(LINE) });

  it('resolves the saved mode, defaulting to Pinned only when a pin has a price for the fuel', () => {
    expect(resolveMode('nearest', s, prefs(), ['a'])).toBe('nearest');
    expect(resolveMode(null, s, prefs(), ['a'])).toBe('pinned');
    expect(resolveMode(null, s, prefs(), [])).toBe('cheapest');
    expect(resolveMode('bogus', s, prefs(), [])).toBe('cheapest');
    // 0.3.0 widgets whose pins don't sell the fuel (or are gone) keep the cheapest nearby
    expect(resolveMode(null, snap(), prefs(), ['7', 'gone'])).toBe('cheapest');
    expect(resolveMode(null, s, prefs({ fuel: 'P98' }), ['a'])).toBe('cheapest');
    expect(resolveMode(null, null, prefs(), ['a'])).toBe('cheapest');
    expect(resolveMode(null, snap(), prefs(), ['7', '1'])).toBe('pinned');
    expect(parseMode('cheapest')).toBe('cheapest');
    expect(parseMode(undefined)).toBeNull();
    expect(modeKey(42)).toBe('widget.mode.42');
  });
  it('Nearest: fresh stations in the radius, closest first, with the distance as the note', () => {
    const r = chooseRows(s, prefs(), [], 3, 'nearest');
    expect(r.mode).toBe('nearest');
    expect(r.caption).toBe('Near Parramatta 2150');
    expect(r.rows.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    // the distance follows the advice; without a forecast the right-hand note is the gap (not the distance again)
    expect(r.rows[0]).toMatchObject({ advice: 'Fill by Fri', dist: '1.1 km', adviceTone: 'act', note: '+2.0c', fc: null, price: '239.9', uri: 'fuelforecast://station/a' });
    expect(chooseRows(s, prefs(), [], 3, 'cheapest').rows[0].dist).toBeNull();
    expect(chooseRows(s, prefs({ radiusKm: 2 }), [], 3, 'nearest').rows.map((x) => x.id)).toEqual(['a']);
  });
  it('Cheapest: fresh stations in the radius, cheapest first, gap to the median as the note', () => {
    const r = chooseRows(s, prefs({ radiusKm: 5 }), [], 3, 'cheapest');
    expect(r.mode).toBe('nearby');
    expect(r.rows.map((x) => x.id)).toEqual(['e', 'c', 'b']);
    expect(r.rows[1]).toMatchObject({ note: '−18.0c', noteTone: 'cheap' });
  });
  it('both area modes respect the members setting', () => {
    expect(chooseRows(s, prefs({ members: false }), [], 3, 'cheapest').rows.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(chooseRows(s, prefs({ members: false, radiusKm: 5 }), [], 5, 'nearest').rows.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('Pinned: pin order, never falling back to the area', () => {
    expect(chooseRows(s, prefs(), ['c', 'a'], 3, 'pinned').rows.map((x) => x.id)).toEqual(['c', 'a']);
    expect(chooseRows(s, prefs(), [], 3, 'pinned')).toMatchObject({ mode: 'no-pins', rows: [], message: 'No pinned stations. Pin one in Bowser' });
    expect(chooseRows(snap(), prefs(), ['7'], 3, 'pinned')).toMatchObject({ mode: 'no-pins', message: "Your pinned stations don't list U91" });
  });
  it('keeps the empty states', () => {
    for (const m of ['nearest', 'cheapest'] as const)
      expect(chooseRows(s, prefs({ home: null }), [], 3, m).message).toBe('Open Bowser to set your area');
    expect(chooseRows(null, prefs(), [], 3, 'pinned').mode).toBe('no-data');
    expect(chooseRows(s, prefs({ fuel: 'P98' }), [], 3, 'nearest').message).toBe('No fresh P98 prices within 5 km');
  });
  it('carries the selected mode on the model (null for the small widget)', () => {
    expect(buildModel(s, prefs(), [], TODAY, 3, 'nearest').stationMode).toBe('nearest');
    expect(buildModel(s, prefs(), [], TODAY).stationMode).toBeNull();
  });
});

describe('widget list length and fuel chip', () => {
  const many: Stations = {
    schema: 1, asof: TODAY, suburbs: [],
    stations: Array.from({ length: 14 }, (_, i) => st(`m${i}`, `M${i}`, 220 + i, 0, { la: home.la + 0.001 * i })),
  };
  const s = snap({ stations: compactStations(many) });
  it('lists up to 10 stations nearby, and every pin', () => {
    expect(MAX_ROWS).toBe(10);
    expect(buildModel(s, prefs(), [], TODAY, MAX_ROWS, 'cheapest').rows).toHaveLength(10);
    expect(buildModel(s, prefs(), [], TODAY, MAX_ROWS, 'nearest').rows.map((r) => r.id)).toEqual(many.stations.slice(0, 10).map((x) => x.id));
    const pins = many.stations.slice(0, 10).map((x) => x.id).reverse();
    expect(buildModel(s, prefs(), pins, TODAY, MAX_ROWS, 'pinned').rows.map((r) => r.id)).toEqual(pins);
  });
  it('cycles U91 -> E10 -> P98 -> DL -> U91', () => {
    expect([nextFuel('U91'), nextFuel('E10'), nextFuel('P98'), nextFuel('DL')]).toEqual(['E10', 'P98', 'DL', 'U91']);
    expect(fuelLabel('DL')).toBe('Diesel');
    expect(fuelKey(3)).toBe('widget.fuel.3');
  });
  it('uses the widget\'s saved fuel, else the app\'s', () => {
    expect(resolveFuel('P98', 'U91')).toBe('P98');
    expect(resolveFuel(null, 'E10')).toBe('E10');
    expect(resolveFuel('LPG', 'E10')).toBe('E10');
    expect(parseFuel('DL')).toBe('DL');
    expect(parseFuel(undefined)).toBeNull();
  });
  it('builds everything for the widget\'s fuel: verdict, median gap, rows, chip', () => {
    const m = buildModel(snap(), prefs({ fuel: 'P98' }), ['1'], TODAY, MAX_ROWS, 'cheapest');
    expect(m).toMatchObject({ fuel: 'P98', fuelCode: 'P98', nextFuel: 'DL', head: 'No rush either way', tone: 'calm' });
    expect(m.message).toBe('No fresh P98 prices within 5 km');   // the fixture stations only sell U91
    const u = buildModel(snap(), prefs({ fuel: 'U91' }), [], TODAY, MAX_ROWS, 'cheapest');
    expect(u).toMatchObject({ head: 'Fill up today', nextFuel: 'E10' });
    expect(u.rows[1]).toMatchObject({ id: '1', note: '−8.0c' });   // 229.9 vs the U91 median 237.9
  });
  it('Pinned names the widget\'s fuel when no pin sells it, and the default mode follows the widget\'s fuel', () => {
    expect(chooseRows(snap(), prefs({ fuel: 'E10' }), ['1'], 10, 'pinned').message).toBe("Your pinned stations don't list E10");
    expect(resolveMode(null, snap(), prefs({ fuel: 'U91' }), ['1'])).toBe('pinned');
    expect(resolveMode(null, snap(), prefs({ fuel: 'DL' }), ['1'])).toBe('cheapest');
    expect(resolveMode(null, snap(), prefs({ fuel: 'DL' }), ['7'])).toBe('pinned');
  });
});

describe('widget forecasts and advice', () => {
  // stations.json index 5: the station's 7-day forecast price
  const withFc = (id: string, price: number, fc: unknown, label = 'Fill by Fri 23 Oct', code = 'by'): Station =>
    ({ ...st(id, id, price, 0), p: { U91: [price, 0, code, label, 'reason', fc] as never } });
  const S: Stations = {
    schema: 1, asof: TODAY, suburbs: [],
    stations: [withFc('up', 230, 232.4), withFc('down', 231, 229.0, 'Wait', 'wait'), withFc('flat', 232, 232.3, 'No rush', 'any'), withFc('none', 233, undefined, 'Any time', 'ok'), withFc('bad', 234, 'x', 'Check price', 'chk')],
  };
  const s = snap({ stations: compactStations(S) });
  const rows = Object.fromEntries(chooseRows(s, prefs(), [], 10, 'cheapest').rows.map((r) => [r.id, r]));

  it('shortens "Fill by <day> <date>" and leaves other labels alone', () => {
    expect(shortAdvice('Fill by Fri 23 Oct')).toBe('Fill by Fri');
    expect(shortAdvice('Fill by Sat 1 Nov')).toBe('Fill by Sat');
    for (const l of ['Fill now', 'Wait', 'No rush', 'Any time', 'Check price', 'Fill by Fri']) expect(shortAdvice(l)).toBe(l);
  });
  it('colours the forecast: dear up 0.5c+, cheap down 0.5c+, muted otherwise', () => {
    expect(fcTone(230, 230.5)).toBe('dear');
    expect(fcTone(230, 229.5)).toBe('cheap');
    expect(fcTone(230, 230.4)).toBe('flat');
    expect(fcTone(230, 229.6)).toBe('flat');
    expect(rows.up).toMatchObject({ fc: '→ 232.4', fcTone: 'dear', advice: 'Fill by Fri', adviceTone: 'act' });
    expect(rows.down).toMatchObject({ fc: '→ 229.0', fcTone: 'cheap', advice: 'Wait', adviceTone: 'wait' });
    expect(rows.flat).toMatchObject({ fc: '→ 232.3', fcTone: 'flat', adviceTone: 'calm' });
  });
  it('falls back to the mode\'s note when the forecast is missing or not a number (old data, fail-soft days)', () => {
    expect(rows.none).toMatchObject({ fc: null, note: '−4.9c', noteTone: 'cheap' });
    expect(rows.bad).toMatchObject({ fc: null, advice: 'Check price' });
    expect(compactStations(S).stations.map((x) => x.p.U91![4])).toEqual([232.4, 229.0, 232.3, null, null]);
  });
  it('keeps the age, not the forecast, for a stale pinned price', () => {
    const old = snap({ stations: compactStations({ ...S, stations: [{ ...withFc('old', 230, 235), p: { U91: [230, 12, 'by', 'Fill by Fri 23 Oct', 'r', 235] as never } }] }) });
    expect(chooseRows(old, prefs(), ['old'], 10, 'pinned').rows[0]).toMatchObject({ fc: null, note: '12 days old' });
  });
  it('gives the Sydney forecast for the widget\'s fuel: now -> now + d7', () => {
    expect(sydneyForecast(U91)).toEqual({ long: '237.9 now → 240.4 in 7 days', mid: '237.9 → 240.4 in 7 days', short: '237.9 → 240.4', tone: 'dear' });
    expect(buildModel(snap(), prefs({ fuel: 'DL' }), [], TODAY).sydney?.short).toMatch(/^278\.9 → /);
    expect(buildModel(null, prefs(), [], TODAY).sydney).toBeNull();
  });
  it('fits the forecast into the headers, or drops it', () => {
    const m = buildModel(snap(), prefs(), [], TODAY);
    expect(firstFit(['a very long candidate', 'short'], 30, 10)).toBe('short');
    expect(firstFit(['too long', 'still too long'], 1, 10)).toBe('still too long');
    expect(compactHeadline(m, 400)).toBe('Fill up today · 237.9 → 240.4');
    expect(compactHeadline(m, 250)).toBe('Fill up today');          // the 4x2 minimum: no room
    expect(compactHeadline({ ...m, asOf: 'as of 20 Oct' }, 380)).toBe('Fill up today · as of 20 Oct');
    expect(mediumForecastLine(m, 400)).toBe('237.9 now → 240.4 in 7 days');
    expect(mediumForecastLine(m, 300)).toBe('237.9 → 240.4 in 7 days');
    expect(mediumForecastLine(m, 250)).toBe('237.9 → 240.4');
    expect(smallForecastLine(m, 260, false)).toBe('237.9 now → 240.4 in 7 days');
    expect(smallForecastLine(m, 200, false)).toBe('237.9 → 240.4 in 7 days');
    expect(smallForecastLine(m, 150, false)).toBe('237.9 → 240.4');
    expect(smallForecastLine(m, 110, true)).toBe('237.9 → 240.4');
    expect(smallForecastLine({ ...m, asOf: 'as of 20 Oct' }, 110, true)).toBe('as of 20 Oct');
    expect(smallForecastLine({ ...m, sydney: null }, 110, true)).toBeNull();
  });
});

describe('widget compact rows, short rise line', () => {
  it('caps the advice so the name keeps the larger share at 250 dp', () => {
    for (const advice of ['Wait', 'Fill now', 'Fill by Wed', 'Check price', 'A much longer advice label than any we use']) {
      const { adviceW, nameW } = compactRowWidths(250, advice);
      expect(nameW).toBeGreaterThan(adviceW);
      expect(nameW).toBeGreaterThanOrEqual(90);   // ~11 characters of a 13 sp name
    }
    expect(compactRowWidths(250, 'Wait').adviceW).toBeLessThan(compactRowWidths(250, 'Fill by Wed').adviceW);   // short advice isn't padded
    expect(compactRowWidths(0, 'Wait')).toEqual({ adviceW: 0, nameW: 0 });
  });
  it('shortens the rise line for the compact small widget', () => {
    const P98 = F.live.find((r) => r.fuel === 'P98')!;
    expect(riseShort(U91, F.asof, TODAY)).toBe('Rise from Sat');
    expect(riseShort(U91, F.asof, '2026-10-23')).toBe('Rise from tomorrow');
    expect(riseShort(U91, F.asof, '2026-10-25')).toBe('Rising now');
    expect(riseShort({ ...P98, p_jump7: 0.6 }, F.asof, TODAY)).toMatch(/^Jump possible [A-Z][a-z]{2}$/);
    expect(riseShort({ ...P98, p_jump7: 0.01, d1: 0, d3: -1, d7: -2, d14: -3 }, F.asof, TODAY)).toBe('No rise in 14 days');
    const m = buildModel(snap(), prefs(), [], TODAY);
    expect(smallRiseLine(m, 110, true)).toBe('Rise from Sat');
    expect(smallRiseLine(m, 400, false)).toBe('Likely to rise from Sat 24 Oct');
    expect(smallRiseLine({ rise: null, riseShort: null }, 110, true)).toBeNull();
  });
});

describe('widget layout budgets (from the styles widgets.tsx uses)', () => {
  it('medium fixed blocks cover the measured heights', () => {
    const compact = 2 * MED.pad + 2 * MED.padVCompact + Math.max(MED.markCompact, lineH(MED.headCompact), MED.chipCompact) + MED.modeGap + MED.modesCompact + MED.listGap;
    const regular = 2 * MED.pad + 2 * MED.padV + Math.max(MED.mark, lineH(MED.head) + 2 * lineH(MED.sub), MED.chip + lineH(MED.asOf)) + MED.modeGap + MED.modes + MED.listGap;
    expect(compact).toBe(78);
    expect(regular).toBe(118);
    expect(MEDIUM_FIXED.compact).toBeGreaterThanOrEqual(compact);
    expect(MEDIUM_FIXED.regular).toBeGreaterThanOrEqual(regular);
    expect(MEDIUM_FIXED.caption).toBeGreaterThanOrEqual(MED.captionGap + lineH(MED.caption));
  });
  it('rows are as tall as their lines', () => {
    const two = 2 * ROW.padV + Math.max(lineH(ROW.name) + lineH(ROW.sub), lineH(ROW.price) + lineH(ROW.sub));
    const one = 2 * ROW.padV + Math.max(lineH(ROW.name), lineH(ROW.sub), lineH(ROW.price));
    expect(LIST_ROW_H.two).toBeGreaterThanOrEqual(two);
    expect(LIST_ROW_H.one).toBeGreaterThanOrEqual(one);
    expect(MEDIUM_COMPACT_BELOW).toBe(MEDIUM_FIXED.regular + LIST_ROW_H.two);
  });
  it('the 4x2 minimum fits the compact header, mode row and one row', () => {
    expect(MEDIUM_FIXED.compact + LIST_ROW_H.one).toBeLessThanOrEqual(110);
  });
  it('the small widget fits at 110 x 110 and at 150 x 150', () => {
    expect(smallCompact(110, 110)).toBe(true);
    expect(smallCompact(200, 140)).toBe(true);
    expect(smallCompact(150, 150)).toBe(false);
    expect(smallHeight(true)).toBeLessThanOrEqual(110);
    expect(smallHeight(false)).toBeLessThanOrEqual(150);
  });
});
