import { describe, expect, it, jest } from '@jest/globals';
import Supercluster from 'supercluster';

import { km } from '../geo';
import { areaMoved, bboxOf, brandLabel, inBox, lonSpanAt, mapStations, padBox, priceTiers, regionFor, zoomOf } from '../map';
import { DEFAULTS, normalize } from '../settings';
import type { Station } from '../types';

jest.mock('../storage', () => {
  const m = new Map<string, string>();
  return { __esModule: true, default: { getItemSync: (k: string) => m.get(k) ?? null, setItemSync: (k: string, v: string) => m.set(k, v) } };
});

const st = (id: string, la: number, lo: number, u91: number, m: 0 | 1 = 0): Station => ({
  id, n: `Station ${id}`, b: 'Ampol', s: 'S', pc: 2000, la, lo, m, p: { U91: [u91, 1, 'ok', 'No rush', ''] },
});

describe('priceTiers', () => {
  it('splits prices into thirds', () => {
    const t = priceTiers([200, 201, 202, 203, 204, 205, 206, 207, 208]);
    expect([200, 202, 203, 205, 206, 208].map(t)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });
  it('keeps ties in one colour', () => {
    const t = priceTiers([200, 200, 200, 200, 210, 220]);
    expect(t(200)).toBe('low');
    expect(t(220)).toBe('high');
  });
  it('colours prices outside the area against it (a far pinned station)', () => {
    const t = priceTiers([200, 205, 210]);
    expect(t(190)).toBe('low');
    expect(t(230)).toBe('high');
  });
  it('is all mid when the spread is under 1c or there are too few stations', () => {
    expect(priceTiers([200, 200.5, 200.9])(200)).toBe('mid');
    expect(priceTiers([200, 220])(200)).toBe('mid');
    expect(priceTiers([])(200)).toBe('mid');
  });
});

describe('mapStations', () => {
  const home = { label: 'home', la: -33.87, lo: 151.0 };
  const stations = [st('1', -33.87, 151.0, 200), st('2', -33.87, 151.2, 210), st('3', -33.87, 151.21, 190, 1)];

  it('has every station, however far, with distances from home', () => {
    const rows = mapStations(stations, 'U91', { home, members: true });
    expect(rows.map((r) => r.id)).toEqual(['3', '1', '2']);
    expect(rows.find((r) => r.id === '2')!.d).toBeCloseTo(km(home.la, home.lo, -33.87, 151.2), 5);
  });
  it('respects members-only, and has no distances without an area', () => {
    expect(mapStations(stations, 'U91', { home, members: false }).map((r) => r.id)).toEqual(['1', '2']);
    expect(mapStations(stations, 'U91', { home: null, members: true }).every((r) => r.d === null)).toBe(true);
  });
});

describe('regions', () => {
  it('fits the radius', () => {
    const r = regionFor({ label: '', la: -33.87, lo: 151 }, 5);
    expect(r.latitudeDelta * 111.32).toBeGreaterThan(10);
    expect(r.longitudeDelta).toBeGreaterThan(r.latitudeDelta);   // degrees of longitude are shorter here
    const [w, s, e, n] = bboxOf(r);
    expect(w < 151 && e > 151 && s < -33.87 && n > -33.87).toBe(true);
    expect(zoomOf(r, 360)).toBeGreaterThan(11);
    expect(zoomOf(r, 360)).toBeLessThan(13);
    expect(zoomOf(r, 720)).toBeCloseTo(zoomOf(r, 360) + 1, 6);   // a wider view of the same span is one level closer
    expect(lonSpanAt(zoomOf(r, 360), 360)).toBeCloseTo(r.longitudeDelta, 9);
  });
  it('knows what is in view', () => {
    const b = bboxOf(regionFor({ label: '', la: -33.87, lo: 151 }, 5));
    expect(inBox(b, -33.87, 151.02)).toBe(true);
    expect(inBox(b, -33.87, 151.2)).toBe(false);
    expect(inBox(b, -33.5, 151)).toBe(false);
  });
  it('pads the box, more at the bottom', () => {
    const [w, s, e, n] = padBox([150, -34, 151, -33], 0.2, 0.3);
    expect([w, e, n]).toEqual([149.8, 151.2, -32.8]);
    expect(s).toBeCloseTo(-34.5, 9);
  });
});

describe('areaMoved', () => {
  const gps = (lo: number) => ({ label: 'your location', la: -33.87, lo, gps: true });
  it('ignores a small GPS re-read but not a real move', () => {
    expect(areaMoved(gps(151), gps(151.003), 5)).toBe(false);    // ~280 m
    expect(areaMoved(gps(151), gps(151.03), 5)).toBe(true);      // ~2.8 km
  });
  it('treats another suburb, GPS versus suburb, and setting or clearing the area as a change', () => {
    const a = { label: 'Parramatta 2150', la: -33.81, lo: 151.0 };
    expect(areaMoved(a, { ...a }, 5)).toBe(false);
    expect(areaMoved(a, { ...a, label: 'Bondi 2026' }, 5)).toBe(true);
    expect(areaMoved(a, { ...a, gps: true }, 5)).toBe(true);
    expect(areaMoved(null, a, 5)).toBe(true);
    expect(areaMoved(null, null, 5)).toBe(false);
  });
});

describe('misc', () => {
  it('cuts long brand names', () => {
    expect(brandLabel('7-Eleven')).toBe('7-Eleven');
    expect(brandLabel('Metro Petroleum')).toBe('Metro Pet…');
  });
  it('remembers the map or list view, and defaults to the list', () => {
    expect(DEFAULTS.view).toBe('list');
    expect(normalize({ view: 'map' }).view).toBe('map');
    expect(normalize({ view: 'globe' }).view).toBe('list');
  });
  it('clusters with supercluster under jest', () => {
    const sc = new Supercluster({ radius: 56, maxZoom: 14 });
    sc.load([0, 1, 2].map((i) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [151 + i * 1e-4, -33.87] } })));
    expect(sc.getClusters([150, -34, 152, -33], 10)).toHaveLength(1);
  });
});
