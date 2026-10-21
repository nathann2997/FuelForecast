import { describe, expect, it } from '@jest/globals';

import type { Place } from '../geo';
import type { Forecast, Station, Stations } from '../types';
import {
  asOfLabel, buildModel, chooseRows, compactForecast, compactStations, fromAppData, isFresh, mergeSnapshot, riseText, rowsThatFit, stationUri,
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
  it('prompts to open the app with no data', () => {
    const m = buildModel(null, prefs(), [], TODAY);
    expect(m.head).toBe('Open Bowser');
    expect(m.mode).toBe('no-data');
  });
});

describe('widget station rows', () => {
  it('shows pinned stations first, in pin order, skipping pins without the fuel or no longer listed', () => {
    const r = chooseRows(snap(), prefs(), ['4', '7', 'gone', '1', '3', '8']);
    expect(r.mode).toBe('pinned');
    expect(r.rows.map((x) => x.id)).toEqual(['4', '1', '3']);
    expect(r.rows[0]).toMatchObject({ price: '245.9', note: '+8.0c', noteTone: 'dear', uri: 'fuelforecast://station/4' });
    expect(r.rows[1]).toMatchObject({ note: '−8.0c', noteTone: 'cheap' });
  });
  it('shows a pinned stale price as its age, and "at median"', () => {
    expect(chooseRows(snap(), prefs(), ['2']).rows[0]).toMatchObject({ note: '12 days old', noteTone: 'flat' });
    expect(chooseRows(snap(), prefs(), ['8']).rows[0]).toMatchObject({ note: 'at median', noteTone: 'flat' });
  });
  it('falls back to the 3 cheapest fresh stations near home, respecting radius and members', () => {
    const r = chooseRows(snap(), prefs(), []);
    expect(r.mode).toBe('nearby');
    expect(r.caption).toBe('Cheapest near Parramatta 2150');
    expect(r.rows.map((x) => x.id)).toEqual(['6', '1', '3']);
    expect(r.rows[0].name).toBe('Members Club');
    expect(chooseRows(snap(), prefs({ members: false }), []).rows.map((x) => x.id)).toEqual(['1', '3', '8']);
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
  it('uses the advice label when there is no median for the fuel', () => {
    const s = snap({ forecast: null });
    expect(chooseRows(s, prefs(), ['1']).rows[0]).toMatchObject({ note: 'Fill by Fri', noteTone: 'act' });
  });
  it('encodes station ids in deep links', () => {
    expect(stationUri('12/3')).toBe('fuelforecast://station/12%2F3');
  });
});

describe('widget cache', () => {
  it('drops the long reason text and stations without an id', () => {
    const c = compactStations({ ...STATIONS, stations: [...STATIONS.stations, { ...st('x', 'No id', 230, 0), id: '' }] });
    expect(c.stations).toHaveLength(STATIONS.stations.length);
    expect(c.stations[0].p.U91).toEqual([229.9, 0, 'by', 'Fill by Fri']);
  });
  it('is fresh when both files are today\'s, or when fetched in the last 30 minutes', () => {
    const now = 1_000_000_000;
    expect(isFresh(snap({ fetchedAt: 0 }), TODAY, now)).toBe(true);
    const old = snap({ fetchedAt: now - 60 * 60 * 1000 });
    old.forecast!.asof = '2026-10-20';
    expect(isFresh(old, TODAY, now)).toBe(false);
    expect(isFresh({ ...old, fetchedAt: now - 60_000 }, TODAY, now)).toBe(true);
    expect(isFresh(null, TODAY, now)).toBe(false);
  });
  it('fits fewer rows on a short medium widget', () => {
    expect(rowsThatFit(110)).toEqual({ rows: 1, caption: false });
    expect(rowsThatFit(180)).toEqual({ rows: 3, caption: true });
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
  it("uses the app's data only when both files are today's", () => {
    const r = fromAppData(null, { forecast: F, stations: STATIONS }, TODAY)!;
    expect(r.use).toBe(true);
    expect(r.changed).toBe(true);
    expect(fromAppData(null, { forecast: F }, TODAY)!.use).toBe(false);
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
