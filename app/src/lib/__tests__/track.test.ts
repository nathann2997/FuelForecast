import { describe, expect, it } from '@jest/globals';

import { callsFor, callValue, callWord, headline, LIVE_MIN, outcomeText } from '../track';
import type { Call, Tally, Track } from '../types';

const tally = (n: number, right: number, from = '2021-01-01', to = '2026-08-24'): Tally => ({ n, right, close: 0, wrong: n - right, from, to });
const track = (liveU91: Tally & { since: string | null }): Track => ({
  schema: 1, asof: '2026-10-22', window: 7, min_days: 5, calls: [],
  live: { U91: liveU91, E10: { ...tally(0, 0), since: null }, P98: { ...tally(0, 0), since: null }, DL: { ...tally(0, 0), since: null } },
  replay: { U91: tally(2062, 1723), E10: tally(2062, 1719), P98: tally(2062, 1703), DL: tally(0, 0) },
});
const call = (over: Partial<Call>): Call => ({ date: '2026-10-13', fuel: 'U91', cls: 'up', head: 'Fill up today', now: 242.9, move: 3.4, days: 7, status: 'right', ...over });

describe('headline', () => {
  it('uses the replayed backtest until enough live calls are scored', () => {
    expect(headline(track({ ...tally(3, 3, '2026-10-22', '2026-10-24'), since: '2026-10-22' }), 'U91'))
      .toEqual({ pct: 84, n: 2062, live: false, text: 'Right 84% of the time', sub: 'tested on 2021–2026 prices' });
  });
  it('switches to live calls at LIVE_MIN', () => {
    const h = headline(track({ ...tally(LIVE_MIN, 8, '2026-10-22', '2026-11-01'), since: '2026-10-22' }), 'U91');
    expect(h).toMatchObject({ pct: 80, live: true, sub: '10 calls since 22 Oct' });
  });
  it('is null with nothing to show (no replay for the fuel, or none at all)', () => {
    expect(headline(track({ ...tally(0, 0), since: null }), 'DL')).toBeNull();
    expect(headline({ ...track({ ...tally(0, 0), since: null }), replay: null }, 'U91')).toBeNull();
  });
});

describe('what happened', () => {
  it('describes complete and pending windows', () => {
    expect(outcomeText(call({}))).toBe('Prices averaged 3.4c higher the week after');
    expect(outcomeText(call({ move: -2.3, status: 'wrong' }))).toBe('Prices averaged 2.3c lower the week after');
    expect(outcomeText(call({ move: 0.2, cls: 'flat', status: 'right' }))).toBe('Prices held steady the week after');
    expect(outcomeText(call({ move: -1.2, days: 4, status: 'pending' }))).toBe('So far 1.2c lower (4 of 7 days)');
    expect(outcomeText(call({ move: null, days: 0, status: 'pending' }))).toBe('Too early to tell');
  });
  it('values following the call on your tank', () => {
    expect(callValue(call({}), 50)).toEqual({ text: 'Saved about $1.70 a tank', good: true });
    expect(callValue(call({ cls: 'down', move: -4, status: 'right' }), 50)).toEqual({ text: 'Saved about $2.00 a tank', good: true });
    expect(callValue(call({ move: -2.3, status: 'wrong' }), 50)).toEqual({ text: 'Cost about $1.15 a tank', good: false });
    expect(callValue(call({ cls: 'flat' }), 50)).toBeNull();
    expect(callValue(call({ status: 'pending' }), 50)).toBeNull();
    expect(callValue(call({ move: 0.3, status: 'close' }), 50)).toBeNull();
  });
  it('names the call and filters by fuel', () => {
    expect([callWord({ cls: 'up' }), callWord({ cls: 'down' }), callWord({ cls: 'flat' })]).toEqual(['Fill', 'Wait', 'No rush']);
    const t = { ...track({ ...tally(0, 0), since: null }), calls: [call({}), call({ fuel: 'DL' })] };
    expect(callsFor(t, 'DL')).toHaveLength(1);
  });
});
