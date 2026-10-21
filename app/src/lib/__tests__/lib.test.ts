import { describe, expect, it } from '@jest/globals';

import { chartData, yBounds } from '../chart';
import { backtestRows, horizons, insights, jumpRisk, signalWhy } from '../copy';
import { addDays, daysBetween, fmt, nice, sydneyToday, updatedText } from '../format';
import { findSuburb, km, rankStations } from '../geo';
import type { Forecast, History, Station, Suburb } from '../types';
import fixture from './forecast.fixture.json';

const F = fixture as unknown as Forecast;
const U91 = F.live.find((r) => r.fuel === 'U91')!;

describe('format', () => {
  it('formats signed numbers and dates without timezone drift', () => {
    expect(fmt(1.23)).toBe('+1.2');
    expect(fmt(-0.4)).toBe('-0.4');
    expect(fmt(0)).toBe('0.0');
    expect(nice('2026-10-21')).toBe('21 Oct 2026');
    expect(addDays('2026-10-21', 14)).toBe('2026-11-04');
    expect(daysBetween('2026-09-30', '2026-10-21')).toBe(21);
    expect(updatedText(0)).toBe('Updated today');
    expect(updatedText(3)).toBe('Updated 3 days ago');
  });
  it('uses the Sydney calendar day', () => {
    // 19:30 UTC on the 20th is 06:30 on the 21st in Sydney (AEDT)
    expect(sydneyToday(new Date('2026-10-20T19:30:00Z'))).toBe('2026-10-21');
  });
});

describe('geo', () => {
  it('computes great-circle distance', () => {
    // Town Hall to Parramatta station, ~20 km
    expect(km(-33.8732, 151.2061, -33.815, 151.0011)).toBeGreaterThan(19);
    expect(km(-33.8732, 151.2061, -33.815, 151.0011)).toBeLessThan(21);
  });

  const subs: Suburb[] = [
    { s: 'Parramatta', pc: 2150, la: -33.81, lo: 151.0, n: 10 },
    { s: 'North Parramatta', pc: 2151, la: -33.8, lo: 151.0, n: 3 },
    { s: 'Parklea', pc: 2768, la: -33.72, lo: 150.92, n: 2 },
  ];
  it('matches exact name, then prefix, then substring, and postcodes', () => {
    expect(findSuburb(subs, 'parramatta')!.label).toBe('Parramatta 2150');
    expect(findSuburb(subs, '2151')!.label).toBe('North Parramatta 2151');
    expect(findSuburb(subs, 'Parramatta 2150')!.label).toBe('Parramatta 2150');
    expect(findSuburb(subs, 'park')!.label).toBe('Parklea 2768');
    expect(findSuburb(subs, 'north parr')!.label).toBe('North Parramatta 2151');
    expect(findSuburb(subs, 'zzz')).toBeNull();
    expect(findSuburb(subs, '  ')).toBeNull();
  });

  const st = (n: string, la: number, price: number | null, m: 0 | 1 = 0): Station => ({
    n, b: 'X', s: 'S', pc: 2000, la, lo: 151, m,
    p: price == null ? {} : { U91: [price, 1, 'ok', 'No rush', ''] },
  });
  const stations = [st('far-cheap', -34.0, 200), st('near-dear', -33.87, 230), st('near-mid', -33.88, 220), st('members', -33.87, 199, 1), st('no-u91', -33.87, null)];
  const home = { label: 'here', la: -33.87, lo: 151 };

  it('ranks cheapest first, filters radius, members and missing fuel', () => {
    expect(rankStations(stations, 'U91', { home: null, radiusKm: 5, members: true }).map((r) => r.n)).toEqual(['members', 'far-cheap', 'near-mid', 'near-dear']);
    expect(rankStations(stations, 'U91', { home: null, radiusKm: 5, members: false }).map((r) => r.n)).toEqual(['far-cheap', 'near-mid', 'near-dear']);
    expect(rankStations(stations, 'U91', { home, radiusKm: 5, members: false }).map((r) => r.n)).toEqual(['near-mid', 'near-dear']);
    expect(rankStations(stations, 'U91', { home, radiusKm: 5, members: false, sort: 'distance' }).map((r) => r.n)).toEqual(['near-dear', 'near-mid']);
  });
});

describe('copy (dashboard parity)', () => {
  it('derives horizons from the forecast', () => {
    const h = horizons(U91);
    expect(h.map((x) => x.label)).toEqual(['Tomorrow', 'In 3 days', 'In 7 days', 'In 14 days']);
    expect(h[2].value).toBeCloseTo(U91.now + U91.d7);
    expect(h[3].lo).toBeCloseTo(U91.now + U91.lo14);
    for (const x of h) expect(x.cls).toBe(x.delta > 0.4 ? 'up' : x.delta < -0.4 ? 'down' : 'flat');
  });
  it('labels jump risk', () => {
    expect(jumpRisk({ ...U91, p_jump7: 0.6 })).toMatchObject({ pct: 60, label: 'High', cls: 'up' });
    expect(jumpRisk({ ...U91, p_jump7: 0.3 })).toMatchObject({ label: 'Moderate', cls: 'flat' });
    expect(jumpRisk({ ...U91, p_jump7: 0.1 })).toMatchObject({ label: 'Low', cls: 'down' });
  });
  it('writes the why text without history and per fuel', () => {
    expect(signalWhy({ ...U91, d7: 2.5 }, F.stats, F.ctx, undefined)).toMatch(/^Expected up about 2\.5c over 7 days\. Retailers are selling/);
    const dl = F.live.find((r) => r.fuel === 'DL')!;
    expect(signalWhy({ ...dl, d7: 0 }, F.stats, F.ctx, undefined)).toMatch(/roughly flat.*Pump diesel is \d+c above wholesale\./);
  });
  it('renders insights with missing stats instead of crashing', () => {
    const blank = Object.fromEntries(Object.keys(F.stats).map((k) => [k, null]));
    const g = { ...F, stats: { ...blank, cycles_by_year: [], dow: [] }, ctx: { ...F.ctx, brent_usd: null, fred_last: null } } as unknown as Forecast;
    const out = insights(g);
    expect(out).toHaveLength(9);
    expect(out.find((x) => x.title === 'Margin today')!.big).toBe('–c');
    expect(insights(F).find((x) => x.title === 'Margin today')!.big).toBe(`${F.stats.margin_now!.toFixed(1)}c`);
  });
  it('builds backtest rows for every fuel', () => {
    for (const fuel of ['U91', 'E10', 'P98', 'DL'] as const) {
      const rows = backtestRows(F, fuel);
      expect(rows).toHaveLength(4);
      for (const r of rows) expect(Number.isFinite(r.model)).toBe(true);
    }
  });
});

describe('chart', () => {
  const start = addDays(F.ctx.asof, -499);
  const n = 500;
  const series = (v: number) => Array.from({ length: n }, (_, i) => (i === 100 ? null : v + (i % 7)));
  const H: History = {
    schema: 1, start,
    hist: { U91: { med: series(200), p10: series(190), p90: series(210) }, E10: { med: [], p10: [], p90: [] }, P98: { med: [], p10: [], p90: [] }, DL: { med: [], p10: [], p90: [] } },
    tgp: { ulp: series(180), dl: series(190) },
  };
  it('windows history and appends a 14-day forecast fan anchored at today', () => {
    const d = chartData(H, U91, F.ctx, 'U91', '1Y');
    expect(d.dates[d.asofIndex]).toBe(F.ctx.asof);
    expect(d.dates).toHaveLength(365 + 14);
    expect(d.fc[d.asofIndex]).toBeCloseTo(U91.now);
    expect(d.fc[d.asofIndex + 14]).toBeCloseTo(U91.now + U91.d14);
    expect(d.hi[d.asofIndex + 7]).toBeCloseTo(U91.now + U91.hi7);
    expect(d.med[d.asofIndex + 1]).toBeNull();
    const all = chartData(H, U91, F.ctx, 'U91', 'All');
    expect(all.dates[0]).toBe(start);
    expect(all.med[100]).toBeNull();
    const b = yBounds(d);
    expect(b.min % 10).toBe(0);
    expect(b.max).toBeGreaterThanOrEqual(U91.now + U91.hi14);
  });
});
