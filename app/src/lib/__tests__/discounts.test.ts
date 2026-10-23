import { describe, expect, it, jest } from '@jest/globals';

import { chooseRows, compactForecast, compactStations, isFresh, type WidgetPrefs, type WidgetSnapshot } from '../../widget/logic';
import { cleanDiscounts, MAX_DISCOUNTS, offFor, offText, withDiscount, yourPrice } from '../discounts';
import { applyFilters, FILTER_DEFAULTS, pinnedRows } from '../filters';
import { rankStations } from '../geo';
import { normalize } from '../settings';
import type { Forecast, Station, StationPrice, Stations } from '../types';
import fixture from './forecast.fixture.json';

// settings.ts reads storage at import time; give it an empty in-memory store (jest hoists this above the imports)
jest.mock('../storage', () => {
  const m = new Map<string, string>();
  return { __esModule: true, default: { getItemSync: (k: string) => m.get(k) ?? null, setItemSync: (k: string, v: string) => m.set(k, v) } };
});

const price = (p: number, age: number | null = 1): StationPrice => [p, age, 'ok', 'No rush', '', p + 2];
const st = (id: string, b: string, u91: number, la = -33.87): Station => ({
  id, n: `Station ${id}`, b, s: 'S', pc: 2000, la, lo: 151, m: 0, p: { U91: price(u91) },
});
// Pump: Ampol 200 < BP 202 < Shell 203.5. With 4c off at BP and 5c at Shell: BP 198 < Shell 198.5 < Ampol 200
const stations = [st('1', 'Ampol', 200), st('2', 'BP', 202), st('3', 'Shell', 203.5)];
const home = { label: 'here', la: -33.87, lo: 151 };
const D = { BP: 4, Shell: 5 };

describe('cleanDiscounts', () => {
  it('keeps brands with a cents value in range, rounded to 0.5c', () => {
    expect(cleanDiscounts({ BP: 4, Shell: 4.26, Ampol: 0.2, X: 31, Y: '4', Z: NaN, '': 4 })).toEqual({ BP: 4, Shell: 4.5 });
  });
  it('drops anything that is not an object of numbers, and a __proto__ key', () => {
    expect(cleanDiscounts(null)).toEqual({});
    expect(cleanDiscounts([4])).toEqual({});
    expect(cleanDiscounts('BP')).toEqual({});
    const evil = JSON.parse('{"__proto__": 4, "BP": 4}');
    const out = cleanDiscounts(evil);
    expect(out).toEqual({ BP: 4 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
  it('keeps at most MAX_DISCOUNTS', () => {
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`B${i}`, 4]));
    expect(Object.keys(cleanDiscounts(many))).toHaveLength(MAX_DISCOUNTS);
  });
});

describe('withDiscount, offFor, yourPrice, offText', () => {
  it('adds, changes and removes', () => {
    let d = withDiscount({}, 'BP', 4);
    expect(d).toEqual({ BP: 4 });
    d = withDiscount(d, 'BP', 6);
    expect(d).toEqual({ BP: 6 });
    expect(withDiscount(d, 'BP', null)).toEqual({});
  });
  it("won't add past the cap, but still changes an existing one", () => {
    const full = Object.fromEntries(Array.from({ length: MAX_DISCOUNTS }, (_, i) => [`B${i}`, 4]));
    expect(withDiscount(full, 'New', 4)).toEqual(full);
    expect(withDiscount(full, 'B0', 8).B0).toBe(8);
  });
  it('reads 0 for brands without a discount (including inherited names)', () => {
    expect(offFor(D, 'BP')).toBe(4);
    expect(offFor(D, 'Ampol')).toBe(0);
    expect(offFor(D, 'toString')).toBe(0);
    expect(offFor(undefined, 'BP')).toBe(0);
  });
  it('rounds your price to 0.1c and prints cents', () => {
    expect(yourPrice(202.9, 4)).toBe(198.9);
    expect(yourPrice(200.05, 0.5)).toBe(199.6);
    expect(offText(4)).toBe('4c');
    expect(offText(4.5)).toBe('4.5c');
  });
});

describe('ranking by the price you pay', () => {
  it('sorts cheapest by your price and keeps the pump price', () => {
    const plain = rankStations(stations, 'U91', { home, radiusKm: 5, members: true });
    expect(plain.map((r) => r.b)).toEqual(['Ampol', 'BP', 'Shell']);
    expect(plain[1]).toMatchObject({ price: 202, pump: 202, off: 0 });
    const mine = rankStations(stations, 'U91', { home, radiusKm: 5, members: true, discounts: D });
    expect(mine.map((r) => [r.b, r.price])).toEqual([['BP', 198], ['Shell', 198.5], ['Ampol', 200]]);
    expect(mine[0]).toMatchObject({ pump: 202, off: 4 });
  });
  it('applies Max price to your price', () => {
    const mine = rankStations(stations, 'U91', { home, radiusKm: 5, members: true, discounts: D });
    expect(applyFilters(mine, { ...FILTER_DEFAULTS, maxPrice: 199 }).map((r) => r.b)).toEqual(['BP', 'Shell']);
  });
  it('gives pinned rows your price', () => {
    expect(pinnedRows(stations, 'U91', ['1', '2'], home, D).map((x) => x.row?.price)).toEqual([200, 198]);
    expect(pinnedRows(stations, 'U91', ['1', '2'], home).map((x) => x.row?.price)).toEqual([200, 202]);
  });
});

describe('settings', () => {
  it('keeps clean discounts and defaults to none (settings saved before 0.7)', () => {
    expect(normalize({ fuel: 'E10' }).discounts).toEqual({});
    expect(normalize({ discounts: { BP: 4, bad: 'x' } }).discounts).toEqual({ BP: 4 });
  });
});

describe('widget with discounts', () => {
  const F = fixture as unknown as Forecast;
  const S: Stations = { schema: 1, asof: F.asof, suburbs: [], stations };
  const snap = (): WidgetSnapshot => ({ forecast: compactForecast(F), stations: compactStations(S), fetchedAt: 0 });
  const prefs = (over: Partial<WidgetPrefs> = {}): WidgetPrefs => ({ fuel: 'U91', home, radiusKm: 5, members: true, ...over });

  it('keeps the brand in the compact cache', () => {
    expect(compactStations(S).stations.map((s) => s.b)).toEqual(['Ampol', 'BP', 'Shell']);
  });
  it('ranks and shows your price, forecast included', () => {
    const r = chooseRows(snap(), prefs({ discounts: D }), [], 3);
    expect(r.rows.map((x) => [x.name, x.price])).toEqual([['Station 2', '198.0'], ['Station 3', '198.5'], ['Station 1', '200.0']]);
    expect(r.rows[0].fc).toBe('→ 200.0');   // pump 7-day 204.0 less 4c
    expect(r.rows[0].a11y).toContain('with your 4c off');
  });
  it('shows pump prices without discounts, or for a cache from before brands were kept', () => {
    expect(chooseRows(snap(), prefs(), [], 1).rows[0].price).toBe('200.0');
    const old = snap();
    old.stations = { ...old.stations!, stations: old.stations!.stations.map(({ b: _b, ...x }) => x) };
    expect(chooseRows(old, prefs({ discounts: D }), [], 1).rows[0].price).toBe('200.0');
  });
  it('treats a cache without brands as not fresh, so the widget refetches', () => {
    const now = Date.now();
    const fresh = { ...snap(), fetchedAt: now };
    expect(isFresh(fresh, F.asof, now)).toBe(true);
    const old = { ...fresh, stations: { ...fresh.stations!, stations: fresh.stations!.stations.map(({ b: _b, ...x }) => x) } };
    expect(isFresh(old, F.asof, now)).toBe(false);
  });
});
