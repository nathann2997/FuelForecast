import { describe, expect, it, jest } from '@jest/globals';

import { mapUrls } from '../directions';
import { plainWarnings, widgetLocationCopy } from '../copy';
import { applyFilters, brandCounts, brandOptions, FILTER_DEFAULTS, filterCount, isFiltered, pinnedRows, type FilterSettings } from '../filters';
import { areaName, nearestSuburb, rankStations } from '../geo';
import { DEFAULTS, normalize } from '../settings';
import type { AdviceCode, Station, StationPrice, Suburb } from '../types';

// settings.ts reads storage at import time; give it an empty in-memory store (jest hoists this above the imports)
jest.mock('../storage', () => {
  const m = new Map<string, string>();
  return { __esModule: true, default: { getItemSync: (k: string) => m.get(k) ?? null, setItemSync: (k: string, v: string) => m.set(k, v) } };
});

const price = (p: number, age: number | null = 1, code: AdviceCode = 'ok'): StationPrice => [p, age, code, code, ''];
const st = (id: string, b: string, la: number, u91?: StationPrice, m: 0 | 1 = 0): Station => ({
  id, n: `Station ${id}`, b, s: 'S', pc: 2000, la, lo: 151, m, p: u91 ? { U91: u91, E10: [u91[0] - 2, 1, 'ok', 'No rush', ''] } : { DL: [210, 1, 'ok', 'No rush', ''] },
});
const stations = [
  st('1', 'Ampol', -33.87, price(200, 1, 'now')),
  st('2', 'Ampol', -33.871, price(205, 9, 'by')),
  st('3', 'BP', -33.872, price(210, 0, 'hi')),
  st('4', 'Shell', -33.873, price(215, 2, 'any')),
  st('5', '7-Eleven', -33.874, price(220, 1, 'chk')),
  st('6', 'BP', -33.875),                                  // diesel only
  st('7', 'Costco', -33.876, price(190, 0, 'ok'), 1),
];
const home = { label: 'here', la: -33.87, lo: 151 };
const f = (patch: Partial<FilterSettings>): FilterSettings => ({ ...FILTER_DEFAULTS, ...patch });
const rank = (opts: Partial<FilterSettings> = {}) => {
  const s = f(opts);
  return rankStations(stations, 'U91', { home, radiusKm: s.radiusKm, members: s.members, sort: s.sort });
};
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('filters', () => {
  it('counts active filters but not sort or radius', () => {
    expect(filterCount(FILTER_DEFAULTS)).toBe(0);
    expect(filterCount(f({ sort: 'distance', radiusKm: 20 }))).toBe(0);
    expect(isFiltered(f({ sort: 'distance' }))).toBe(true);
    expect(isFiltered(FILTER_DEFAULTS)).toBe(false);
    expect(filterCount(f({ brands: ['BP', 'Shell'], advice: ['now'], maxPrice: 200, members: false, showStale: true, pinnedOnly: true }))).toBe(6);
  });

  it('lists brands for the fuel, most common first', () => {
    expect(brandCounts(stations, 'U91')).toEqual([
      { brand: 'Ampol', n: 2 },
      { brand: '7-Eleven', n: 1 },
      { brand: 'BP', n: 1 },
      { brand: 'Costco', n: 1 },
      { brand: 'Shell', n: 1 },
    ]);
    expect(brandCounts(stations, 'DL').map((b) => b.brand)).toEqual(['BP']);
  });

  it('hides old prices unless asked', () => {
    expect(ids(applyFilters(rank(), FILTER_DEFAULTS))).toEqual(['7', '1', '3', '4', '5']);
    expect(ids(applyFilters(rank(), f({ showStale: true })))).toEqual(['7', '1', '2', '3', '4', '5']);
  });

  it('filters by brand, advice group, max price and members', () => {
    const all = f({ showStale: true });
    expect(ids(applyFilters(rank(), { ...all, brands: ['Ampol', 'Shell'] }))).toEqual(['1', '2', '4']);
    // "Wait" covers wait and hi (Skip for now); "No rush or Any time" covers ok and any
    expect(ids(applyFilters(rank(), { ...all, advice: ['wait'] }))).toEqual(['3']);
    expect(ids(applyFilters(rank(), { ...all, advice: ['calm', 'chk'] }))).toEqual(['7', '4', '5']);
    expect(ids(applyFilters(rank(), { ...all, maxPrice: 205 }))).toEqual(['7', '1', '2']);
    expect(ids(applyFilters(rank({ members: false }), { ...all, members: false }))).toEqual(['1', '2', '3', '4', '5']);
  });

  it('keeps pinned stations in pin order whatever the radius, and flags those with no price', () => {
    const p = pinnedRows(stations, 'U91', ['4', '6', 'gone', '7'], { label: 'far', la: -34.5, lo: 151 });
    expect(p.map((x) => x.id)).toEqual(['4', '6', 'gone', '7']);
    expect(p[0].row?.price).toBe(215);
    expect(p[0].row?.d).toBeGreaterThan(60);
    expect(p[1].row).toBeNull();
    expect(p[1].station?.b).toBe('BP');            // in today's data but doesn't sell U91
    expect(p[2]).toEqual({ id: 'gone', row: null, station: null });
    expect(p[3].row?.m).toBe(1);                    // members filter doesn't apply to pins
    expect(pinnedRows(stations, 'U91', [], home)).toEqual([]);
  });
});

describe('settings', () => {
  it('fills new fields for settings saved by older versions', () => {
    const old = { fuel: 'E10', radiusKm: 10, members: false, sort: 'distance', tankL: 60, home: { label: 'x', la: -33.8, lo: 151 }, showStale: true };
    // onboarded: an older install with an area skips the welcome screen
    expect(normalize(old)).toEqual({ ...old, brands: [], advice: [], maxPrice: null, pinnedOnly: false, onboarded: true, alerts: false, discounts: {}, view: 'list' });
    expect(normalize({ fuel: 'E10' }).onboarded).toBe(false);
    expect(normalize({ fuel: 'P95' }).fuel).toBe('P95');   // added 2026-10: not reset to U91
    expect(normalize({ fuel: 'E85' }).fuel).toBe('U91');   // not tracked
    expect(normalize({ ...old, onboarded: false }).onboarded).toBe(false);
  });
  it('drops fields of the wrong shape', () => {
    expect(normalize(null)).toEqual(DEFAULTS);
    expect(normalize('x')).toEqual(DEFAULTS);
    const n = normalize({ fuel: 'LPG', radiusKm: 7, members: 'yes', brands: ['BP', 3, 'BP'], advice: ['now', 'bogus'], maxPrice: -1, home: { la: 'x' } });
    expect(n.fuel).toBe('U91');
    expect(n.radiusKm).toBe(5);
    expect(n.members).toBe(true);
    expect(n.brands).toEqual(['BP']);
    expect(n.advice).toEqual(['now']);
    expect(n.maxPrice).toBeNull();
    expect(n.home).toBeNull();
  });
});

describe('show on map', () => {
  it('drops a named pin (geo: on Android, Apple Maps on iOS, the Google Maps URL on the web), never starts navigation', () => {
    const web = 'https://www.google.com/maps/search/?api=1&query=-33.8,151.2';
    expect(mapUrls('android', -33.8, 151.2, 'BP Manly')).toEqual(['geo:0,0?q=-33.8,151.2(BP%20Manly)', web]);
    expect(mapUrls('android', -33.8, 151.2)).toEqual(['geo:0,0?q=-33.8,151.2', web]);
    // brackets and & in station names stay inside the label
    expect(mapUrls('android', -33.8, 151.2, 'BP Mosman (9542)')[0]).toBe('geo:0,0?q=-33.8,151.2(BP%20Mosman%20%289542%29)');
    expect(mapUrls('android', -33.8, 151.2, 'Jack & Co')[0]).toBe('geo:0,0?q=-33.8,151.2(Jack%20%26%20Co)');
    expect(mapUrls('ios', -33.8, 151.2, 'BP Manly')).toEqual(['maps://?ll=-33.8,151.2&q=BP%20Manly', web]);
    expect(mapUrls('web', -33.8, 151.2)).toEqual([web]);
    // API coordinates that aren't numbers never reach a URL
    expect(mapUrls('android', NaN, 151.2)).toEqual([]);
    expect(mapUrls('ios', '0&x=1' as unknown as number, 151.2)).toEqual([]);
    expect(mapUrls('web', '-33.8' as unknown as number, 151.2)).toEqual([web]);   // a numeric string is fine
    for (const os of ['android', 'ios', 'web']) {
      for (const u of mapUrls(os, -33.8, 151.2, 'X')) expect(u).not.toMatch(/navigation|daddr|\/dir\/|destination/);
    }
  });
});

describe('brand options in the sheet', () => {
  const brands = Array.from({ length: 15 }, (_, i) => ({ brand: `B${i}`, n: 15 - i }));
  const names = (x: { brand: string }[]) => x.map((b) => b.brand);
  it('shows the top brands plus selected ones further down', () => {
    expect(names(brandOptions(brands, [], '', false))).toHaveLength(12);
    expect(names(brandOptions(brands, ['B14'], '', false))).toContain('B14');
    expect(brandOptions(brands, [], '', true)).toHaveLength(15);
  });
  it('keeps a selected brand with no stations for this fuel', () => {
    expect(brandOptions(brands, ['Costco'], '', false).at(-1)).toEqual({ brand: 'Costco', n: 0 });
    expect(names(brandOptions(brands.slice(0, 3), ['Costco'], '', false))).toEqual(['B0', 'B1', 'B2', 'Costco']);
  });
  it('searches by name and keeps selected brands visible', () => {
    expect(names(brandOptions(brands, ['B2'], 'b1', false))).toEqual(['B1', 'B2', 'B10', 'B11', 'B12', 'B13', 'B14']);
  });
});

describe('plain warnings', () => {
  it('rewrites known warnings and hides technical ones', () => {
    expect(
      plainWarnings(['tgp_last is 12 days old', 'fred_last is 30 days old', 'station files unavailable: KeyError: x', 'some traceback']),
    ).toEqual([
      'Wholesale prices haven’t updated for 12 days, so the forecast uses the last known ones.',
      'Oil price and exchange rate data haven’t updated for 30 days, so the forecast uses the last known ones.',
      'Station price history isn’t available today.',
    ]);
    expect(plainWarnings([])).toEqual([]);
  });
});

describe('widget location copy', () => {
  const gps = { label: 'your location', gps: true };
  const typed = { label: 'Manly 2095' };
  const yes = { status: 'granted', canAskAgain: true } as const;
  it('is on only with background location and a GPS or unset area', () => {
    expect(widgetLocationCopy(yes, gps)).toEqual({ status: 'On', action: null, note: null, hint: null });
    expect(widgetLocationCopy(yes, null).status).toBe('On');
    expect(widgetLocationCopy(yes, typed)).toEqual({
      status: 'Off – widget uses Manly 2095',
      action: null,
      note: 'Your area is set to Manly 2095. Switch to Use my location for the widget to follow you.',
      hint: null,
    });
  });
  it('asks, with the Settings hint on Android 11+, or sends to settings when Android will not prompt again', () => {
    expect(widgetLocationCopy({ status: 'undetermined', canAskAgain: true }, gps)).toEqual({
      status: 'Off – widget uses where you last opened Bowser', action: 'ask', note: null, hint: null,
    });
    expect(widgetLocationCopy({ status: 'denied', canAskAgain: true }, gps, true).hint).toBe('Next, choose Allow all the time.');
    expect(widgetLocationCopy({ status: 'denied', canAskAgain: false }, null, true)).toEqual({
      status: 'Off – no area set for the widget', action: 'settings', note: null, hint: null,
    });
    expect(widgetLocationCopy({ status: 'unsupported', canAskAgain: false }, gps).action).toBeNull();
  });
  it('never says On when location is off for the whole phone', () => {
    expect(widgetLocationCopy({ ...yes, servicesOff: true }, gps, true)).toEqual({
      status: 'Location is off on this phone', action: 'services', note: null, hint: null,
    });
    expect(widgetLocationCopy({ status: 'denied', canAskAgain: true, servicesOff: true }, typed).note).toContain('Manly 2095');
  });
});

describe('the area as a place name (Stations "Near …")', () => {
  const SUBS: Suburb[] = [
    { s: 'Parramatta', pc: 2150, la: -33.815, lo: 151.003, n: 20 },
    { s: 'Harris Park', pc: 2150, la: -33.823, lo: 151.007, n: 4 },
    { s: 'Postcode 2151', pc: 2151, la: -33.8171, lo: 151.0041, n: 1 },   // junk names in the live list: never shown
    { s: 'Bondi', pc: 2026, la: -33.891, lo: 151.274, n: 6 },
  ];
  const at = (la: number, lo: number) => ({ label: 'your location', la, lo, gps: true });

  it('names the nearest real suburb within 3 km, else none', () => {
    expect(nearestSuburb(SUBS, -33.817, 151.004)?.s).toBe('Parramatta');
    expect(nearestSuburb(SUBS, -33.824, 151.008)?.s).toBe('Harris Park');
    expect(nearestSuburb(SUBS, -33.86, 151.05)).toBeNull();   // ~6 km out
    expect(nearestSuburb(SUBS, -34.5, 150.5)).toBeNull();
  });
  it('says where you are for a GPS area, and flags a last known one', () => {
    expect(areaName(at(-33.817, 151.004), SUBS, true)).toEqual({ text: 'you in Parramatta', lastKnown: false });
    expect(areaName(at(-33.817, 151.004), SUBS, null)).toEqual({ text: 'you in Parramatta', lastKnown: false });   // no answer yet
    expect(areaName(at(-33.817, 151.004), SUBS, false)).toEqual({ text: 'Parramatta', lastKnown: true });
    expect(areaName(at(-34.5, 150.5), SUBS, true)).toEqual({ text: 'you', lastKnown: false });
    expect(areaName(at(-34.5, 150.5), SUBS, false)).toEqual({ text: 'your last location', lastKnown: true });
  });
  it('keeps a typed suburb as typed', () => {
    expect(areaName({ label: 'Bondi 2026', la: -33.891, lo: 151.274 }, SUBS, false)).toEqual({ text: 'Bondi 2026', lastKnown: false });
  });
});
