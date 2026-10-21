import { describe, expect, it } from '@jest/globals';

import { addDays } from '../format';
import {
  behaviour, chartSummary, fcPath, forecastTiles, fuelsSold, pickFuel, rangeStats, riseText, tankText, ticker,
  tickerBounds, tickerData,
} from '../station';
import type { Forecast, History, Series, StationDetail, StationForecast } from '../types';
import { toneOf } from '../outlook';
import forecastFixture from './forecast.fixture.json';
import real1 from './station.fixture.json';
import real2 from './station2.fixture.json';

const ASOF = '2026-10-21';
const START = '2026-09-01';   // 51 days of history up to and including ASOF
const N = 51;

// U91: flat 190 with a 12c jump 10 days ago and a slow slide since; yesterday 196, today 195
const u91: Series = Array.from({ length: N }, (_, i) => {
  if (i < 40) return 190;
  if (i === 40) return 202;
  return 202 - (i - 40) * 0.7;
});
u91[N - 2] = 196;
u91[N - 1] = 195;
u91[3] = null;   // a gap

const FC: StationForecast = {
  now: 195,
  d1: 0.2, lo1: -1, hi1: 1.5,
  d3: 0.5, lo3: -2, hi3: 4,
  d7: 4, lo7: -3, hi7: 12,
  d14: 10, lo14: -2, hi14: 18,
  rise: '2026-10-24',
  adv: ['by', 'Fill by Fri', 'Sydney U91 likely to rise from Sat 24 Oct'],
};

const D: StationDetail = {
  schema: 1, asof: ASOF, id: '123', n: 'Test Servo', b: 'Ampol', s: 'Manly', pc: 2095, la: -33.8, lo: 151.28, m: 0,
  addr: '1 Test St', start: START,
  hist: { U91: u91, P98: new Array(N).fill(null), DL: new Array(N).fill(null) },
  profile: { typ: { U91: -2.34, P98: 0.2 }, lag: 30, part: 0.9, n: 12 },
  fc: { U91: FC, P98: { ...FC, now: 215, rise: null } },
};

const F = forecastFixture as unknown as Forecast;

const H: History = {
  schema: 1,
  start: '2026-08-01',
  hist: {
    U91: { med: Array.from({ length: 82 }, () => 193), p10: [], p90: [] },
    E10: { med: [], p10: [], p90: [] }, P98: { med: [], p10: [], p90: [] }, DL: { med: [], p10: [], p90: [] },
  },
  tgp: { ulp: [], dl: [] },
};

describe('station fuels', () => {
  it('lists fuels with a forecast or any history, in app order', () => {
    expect(fuelsSold(D)).toEqual(['U91', 'P98']);   // DL is all null with no forecast
    expect(pickFuel(['U91', 'P98'], 'P98')).toBe('P98');
    expect(pickFuel(['U91', 'P98'], 'E10')).toBe('U91');
    expect(pickFuel([], 'E10')).toBeNull();
  });
});

describe('ticker', () => {
  it('computes the change since yesterday and over 7 days, and the gap to the median', () => {
    const t = ticker(D, 'U91', 193);
    expect(t.price).toBe(195);
    expect(t.d1!.c).toBeCloseTo(-1);
    expect(t.d1!.pct).toBeCloseTo((-1 / 196) * 100);
    expect(t.d7!.c).toBeCloseTo(195 - (202 - 3 * 0.7));
    expect(t.gap).toBeCloseTo(2);
    expect(t.unchangedDays).toBe(0);
  });
  it('handles a fuel with no history', () => {
    const t = ticker(D, 'P98', 210);
    expect(t.price).toBe(215);
    expect(t.d1).toBeNull();
    expect(t.d7).toBeNull();
    expect(t.gap).toBeCloseTo(5);
  });
  it('counts how long the price has been unchanged', () => {
    const flat = { ...D, hist: { U91: [190, 190, 191, 191, 191] }, start: addDays(ASOF, -4), fc: {} };
    expect(ticker(flat, 'U91', null).unchangedDays).toBe(2);
    expect(ticker(flat, 'U91', null).gap).toBeNull();
  });
});

describe('forecast path', () => {
  it('interpolates between the horizons from zero', () => {
    const p = fcPath(FC);
    expect(p).toHaveLength(15);
    expect(p[0]).toBe(0);
    expect(p[1]).toBeCloseTo(0.2);
    expect(p[2]).toBeCloseTo(0.35);
    expect(p[14]).toBeCloseTo(10);
    expect(fcPath(FC, 'hi')[5]).toBeCloseTo(8);
  });
});

describe('tickerData', () => {
  it('windows the history, aligns the Sydney median by date and continues with the forecast', () => {
    const t = tickerData(D, H, 'U91', '1W');
    expect(t.dates[0]).toBe(addDays(ASOF, -7));
    expect(t.today).toBe(7);
    expect(t.dates[t.today]).toBe(ASOF);
    expect(t.dates).toHaveLength(8 + 14);
    expect(t.px[t.today]).toBe(195);
    expect(t.px[t.today + 1]).toBeNull();
    expect(t.med[0]).toBe(193);
    expect(t.med[t.today + 1]).toBeNull();
    expect(t.fc[t.today]).toBe(195);
    expect(t.fc[t.today - 1]).toBeNull();
    expect(t.fc[t.dates.length - 1]).toBeCloseTo(205);
    expect(t.lo[t.dates.length - 1]).toBeCloseTo(193);
    expect(t.hi[t.dates.length - 1]).toBeCloseTo(213);
  });
  it('trims leading days before the station had a price', () => {
    const late = { ...D, hist: { U91: [...new Array(40).fill(null), ...u91.slice(40)] } };
    const t = tickerData(late, H, 'U91', '1Y');
    expect(t.dates[0]).toBe(addDays(START, 40));
    expect(t.px[0]).toBe(202);
  });
  it('shows only the forecast for a fuel with no history', () => {
    const t = tickerData(D, H, 'P98', '3M');
    expect(t.today).toBe(0);
    expect(t.dates[0]).toBe(ASOF);
    expect(t.dates).toHaveLength(15);
    expect(t.px.every((v) => v == null)).toBe(true);
    expect(t.fc[0]).toBe(215);
  });
  it('works without the Sydney history', () => {
    const t = tickerData(D, undefined, 'U91', '1M');
    expect(t.med.every((v) => v == null)).toBe(true);
    expect(t.px.filter((v) => v != null).length).toBe(31);
  });
  it('has no today for a fuel with neither history nor forecast', () => {
    const t = tickerData(D, H, 'DL', '1M');
    expect(t.today).toBe(-1);
    expect(t.dates).toHaveLength(0);
  });
});

describe('rangeStats', () => {
  it('finds the low, high, average gap and jumps of 5c or more', () => {
    const t = tickerData(D, H, 'U91', '1M');   // days 20..50: 190 x20, jump to 202, slide, 196, 195
    const s = rangeStats(t);
    expect(s.low).toEqual({ v: 190, date: addDays(START, 20) });
    expect(s.high).toEqual({ v: 202, date: addDays(START, 40) });
    expect(s.jumps).toBe(1);
    expect(s.days).toBe(31);
    expect(s.avgGap).toBeCloseTo(s.avg! - 193);
  });
  it('steps over gaps when counting jumps', () => {
    const t = { dates: ['a', 'b', 'c', 'd'], today: 3, px: [190, null, 196, 197], med: [null, null, null, null], fc: [], lo: [], hi: [] };
    const s = rangeStats(t);
    expect(s.jumps).toBe(1);
    expect(s.avgGap).toBeNull();
  });
  it('is empty without history', () => {
    const s = rangeStats(tickerData(D, H, 'P98', '1M'));
    expect(s.low).toBeNull();
    expect(s.avg).toBeNull();
    expect(s.jumps).toBe(0);
  });
});

describe('tickerBounds', () => {
  it('picks a round step with a handful of gridlines', () => {
    const b = tickerBounds(tickerData(D, H, 'U91', '1M'));
    expect(b.min).toBeLessThanOrEqual(190);
    expect(b.max).toBeGreaterThanOrEqual(213);
    expect(b.ticks.length).toBeGreaterThanOrEqual(2);
    expect(b.ticks.length).toBeLessThanOrEqual(6);
  });
  it('widens a flat line', () => {
    const t = { dates: ['a', 'b'], today: 1, px: [190, 190], med: [null, null], fc: [], lo: [], hi: [] };
    const b = tickerBounds(t);
    expect(b.min).toBeLessThan(190);
    expect(b.max).toBeGreaterThan(190);
  });
});

describe('forecast copy', () => {
  it('builds the 1/3/7/14-day tiles', () => {
    const t = forecastTiles(FC, ASOF);
    expect(t.map((x) => x.h)).toEqual([1, 3, 7, 14]);
    expect(t[3]).toMatchObject({ v: 205, lo: 193, hi: 213, delta: 10, date: '2026-11-04' });
  });
  it('says when the price is likely to rise', () => {
    expect(riseText(FC, ASOF, 'act')).toBe('Likely to rise from Sat 24 Oct');
    expect(riseText({ ...FC, rise: '2026-10-22' }, ASOF, 'act')).toBe('Likely to rise from tomorrow');
    expect(riseText({ ...FC, rise: ASOF }, ASOF, 'act')).toBe('Prices likely rising now');
    expect(riseText({ ...FC, rise: null }, ASOF, 'act')).toBe('No rise expected in 14 days');
  });
  it('only says "likely" when the Sydney verdict says act, as Today and the widget do', () => {
    expect(riseText(FC, ASOF, 'calm')).toBe('Jump possible from Sat 24 Oct');
    expect(riseText({ ...FC, rise: '2026-10-22' }, ASOF, 'wait')).toBe('Jump possible from tomorrow');
    expect(riseText({ ...FC, rise: ASOF }, ASOF, undefined)).toBe('A jump is possible any day');
    expect(tankText(FC, ASOF, 50, 'calm')).toBe('If prices do jump, filling before Sat 24 Oct saves about $5.00 on a 50 L tank.');
  });
  it('puts the forecast in dollars for a tank', () => {
    expect(tankText(FC, ASOF, 50, 'act')).toBe('Filling before Sat 24 Oct saves about $5.00 on a 50 L tank.');
    const down = { ...FC, rise: null, d1: -0.5, d3: -2, d7: -4, d14: -1 };
    expect(tankText(down, ASOF, 60, 'wait')).toBe('Waiting until Wed 28 Oct could save about $2.40 on a 60 L tank.');
    const flat = { ...FC, rise: null, d1: 0, d3: 0.2, d7: 0.4, d14: 0.5 };
    expect(tankText(flat, ASOF, 50, 'calm')).toMatch(/little difference/);
  });
});

describe('behaviour', () => {
  it('describes premium, participation and lag in plain English', () => {
    expect(behaviour(D.profile, 'U91')).toEqual([
      'Usually about 2.3c cheaper than the Sydney median for Unleaded 91.',
      'Joins about 9 in 10 Sydney price jumps.',
      'When prices jump, it usually rises about 1 day after most of Sydney.',
    ]);
  });
  it('calls out steady pricers and fast followers', () => {
    const p = { typ: { U91: 0.1 }, lag: 4, part: 0.25, n: 20 };
    expect(behaviour(p, 'U91')).toEqual([
      'Usually prices Unleaded 91 at about the Sydney median.',
      'A steady pricer: joins only about 3 in 10 Sydney price jumps.',
      'When prices jump, it usually rises with the first wave.',
    ]);
    expect(behaviour({ ...p, lag: 80, part: 1 }, 'U91')[2]).toBe('When prices jump, it usually rises about 3 days after most of Sydney.');
  });
  it('says nothing about jumps with too few observed, or without a profile', () => {
    expect(behaviour({ typ: {}, lag: 20, part: 0.5, n: 2 }, 'U91')).toEqual([]);
    expect(behaviour(null, 'U91')).toEqual([]);
  });
});

describe('chartSummary', () => {
  it('reads out the range and the forecast', () => {
    const t = tickerData(D, H, 'U91', '1M');
    const s = chartSummary(t, rangeStats(t), 'U91', '1M');
    expect(s).toMatch(/^Unleaded 91 at this station over the last month: low 190.0 cents on 21 Sep, high 202.0 cents on 11 Oct/);
    expect(s).toMatch(/forecast 205 cents in 14 days, likely between 193 and 213\.$/);
  });
});

describe('real station files (export_api.py output)', () => {
  const A = real1 as unknown as StationDetail;   // Ampol Hornsby Heights: U91 + P98, follows jumps ~2 days late
  const B = real2 as unknown as StationDetail;   // Costco Casula: E10 + P98, steady pricer, a few unknown days

  it('lists the fuels each station sells and builds every range', () => {
    expect(fuelsSold(A)).toEqual(['U91', 'P98']);
    expect(fuelsSold(B)).toEqual(['E10', 'P98']);
    for (const st of [A, B])
      for (const f of fuelsSold(st))
        for (const r of ['1W', '1M', '3M', '6M', '1Y'] as const) {
          const t = tickerData(st, undefined, f, r);
          expect(t.dates[t.today]).toBe(st.asof);
          expect(t.px[t.today]).toBeCloseTo(st.fc[f]!.now);
          expect(t.fc[t.dates.length - 1]).toBeCloseTo(st.fc[f]!.now + st.fc[f]!.d14);
          const s = rangeStats(t);
          expect(s.low!.v).toBeLessThanOrEqual(s.high!.v);
          expect(s.jumps).toBeGreaterThanOrEqual(0);
        }
  });
  it('agrees with the forecast on today’s price', () => {
    const t = ticker(A, 'U91', 236.9);
    expect(t.price).toBe(234.9);
    expect(t.d1!.c).toBeCloseTo(0);
    expect(t.gap).toBeCloseTo(-2);
    expect(ticker(B, 'E10', null).d1!.c).toBeCloseTo(0);
  });
  it('describes both behaviours', () => {
    expect(behaviour(A.profile, 'U91')).toEqual([
      'Usually about 2.0c cheaper than the Sydney median for Unleaded 91.',
      'Joins about 8 in 10 Sydney price jumps.',
      'When prices jump, it usually rises about 2 days after most of Sydney.',
    ]);
    expect(behaviour(B.profile, 'E10')).toEqual([
      'Usually about 11.2c cheaper than the Sydney median for E10.',
      'A steady pricer: rarely joins Sydney price jumps.',
    ]);
    // Tones from the same day's forecast.json: U91 "Fill up today" (act), P98 "No rush either way" (calm)
    const tone = (f: string) => toneOf(F.live.find((r) => r.fuel === f)!.verdict.cls);
    expect(riseText(A.fc.U91!, A.asof, tone('U91'))).toBe('Likely to rise from Sat 24 Oct');
    expect(riseText(A.fc.P98!, A.asof, tone('P98'))).toBe('Jump possible from Tue 27 Oct');
    expect(tankText(A.fc.P98!, A.asof, 50, tone('P98'))).toMatch(/^If prices do jump, filling before Tue 27 Oct/);
    expect(riseText(B.fc.E10!, B.asof, tone('E10'))).toBe('No rise expected in 14 days');
  });
});
