// The fill log (lib/fills.ts) and what it saved (lib/savings.ts).
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { Fill } from '../fills';
import { fillSaving, loggedText, medianOn, money, summarise, weekAfter } from '../savings';
import type { History } from '../types';

const mockStore = new Map<string, string>();
jest.mock('../storage', () => ({
  __esModule: true,
  default: { getItemSync: (k: string) => mockStore.get(k) ?? null, setItemSync: (k: string, v: string) => void mockStore.set(k, v) },
}));

type Mod = typeof import('../fills');
let F: Mod;
beforeEach(() => {
  mockStore.clear();
  jest.resetModules();
});
/** A fresh import, which reads the store again (as on an app restart) */
const load = () => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  F = require('../fills') as Mod;
};

const fill = (over: Partial<Fill> = {}): Omit<Fill, 'id'> => ({
  date: '2026-10-01', stationId: '123', name: 'Shell X', brand: 'Shell', suburb: 'X', fuel: 'U91',
  pump: 230, paid: 226, litres: 50, median: 236, ...over,
});

describe('fill log', () => {
  it('adds newest day first and survives a reload', () => {
    load();
    F.addFill(fill({ date: '2026-10-01' }));
    F.addFill(fill({ date: '2026-10-05' }));
    F.addFill(fill({ date: '2026-09-20' }));
    expect(F.getFills().map((f) => f.date)).toEqual(['2026-10-05', '2026-10-01', '2026-09-20']);
    load();
    expect(F.getFills()).toHaveLength(3);
  });
  it('rejects damaged fills, from the UI or from storage', () => {
    load();
    expect(F.addFill(fill({ paid: Number.NaN }))).toBeNull();
    expect(F.addFill(fill({ litres: 0 }))).toBeNull();
    expect(F.addFill(fill({ fuel: 'LPG' as Fill['fuel'] }))).toBeNull();
    expect(F.addFill(fill({ date: '1 Oct' }))).toBeNull();
    mockStore.set('fills.v1', JSON.stringify([{ id: 'a', ...fill() }, { id: 'b' }, 'x', null, { id: 'c', ...fill({ stationId: '../x' }) }]));
    load();
    expect(F.getFills().map((f) => [f.id, f.stationId])).toEqual([['a', '123'], ['c', null]]);
    mockStore.set('fills.v1', '{not json');
    load();
    expect(F.getFills()).toEqual([]);
  });
  it('keeps the newest MAX_FILLS, and same-day fills newest first', () => {
    load();
    const a = F.addFill(fill({ date: '2026-10-05', litres: 10 }))!;
    const b = F.addFill(fill({ date: '2026-10-05', litres: 20 }))!;
    expect(F.getFills().map((f) => f.id)).toEqual([b.id, a.id]);
    for (let i = 0; i < F.MAX_FILLS + 5; i++) F.addFill(fill({ date: '2026-10-06' }));
    expect(F.getFills()).toHaveLength(F.MAX_FILLS);
    expect(F.getFills().every((f) => f.date === '2026-10-06')).toBe(true);
  });
  it('removes by id', () => {
    load();
    const a = F.addFill(fill())!;
    F.addFill(fill({ date: '2026-10-02' }));
    F.removeFill(a.id);
    expect(F.getFills().map((f) => f.date)).toEqual(['2026-10-02']);
  });
});

// History from 2026-10-01: median 236 on day 0, then 240 for seven days (the week after averages 4c higher), and day 8
// (today, so day 7 is over)
const H = (med: (number | null)[]): History => ({
  schema: 1, start: '2026-10-01', tgp: { ulp: [], dl: [] },
  hist: { U91: { med, p10: [], p90: [] }, E10: { med: [], p10: [], p90: [] }, P98: { med: [], p10: [], p90: [] }, DL: { med: [], p10: [], p90: [] } },
});
const full = H([236, 240, 240, 240, 240, 240, 240, 240, 241]);
const f1: Fill = { id: 'x', ...fill() };   // paid 226, median 236, 50 L

describe('savings', () => {
  it('reads the median on a day', () => {
    expect(medianOn(full, 'U91', '2026-10-01')).toBe(236);
    expect(medianOn(full, 'U91', '2026-09-30')).toBeNull();
    expect(medianOn(full, 'U91', '2026-12-01')).toBeNull();
  });
  it('averages the week after once it has passed, allowing two gap days', () => {
    expect(weekAfter(full, 'U91', '2026-10-01')).toBe(240);
    expect(weekAfter(H([236, 240, null, 240, null, 240, 240, 240, 241]), 'U91', '2026-10-01')).toBe(240);
    expect(weekAfter(H([236, 240, null, null, null, 240, 240, 240, 241]), 'U91', '2026-10-01')).toBeNull();
    expect(weekAfter(H([236, 240, 240, 240, 240, 240, 240, 240]), 'U91', '2026-10-01')).toBeNull();   // day 7 is today: not over yet
  });
  it('splits a saving into where and when', () => {
    // where: (236 − 226) × 50 L = $5; when: (240 − 236) × 50 L = $2
    expect(fillSaving(f1, full)).toEqual({ where: 5, when: 2, total: 7, pending: false });
    expect(fillSaving(f1, undefined)).toEqual({ where: 5, when: null, total: 5, pending: true });
    expect(fillSaving({ ...f1, median: null }, undefined)).toEqual({ where: null, when: null, total: null, pending: true });
    // No median when logged (yesterday's forecast was on screen): where comes from history once it has that day
    expect(fillSaving({ ...f1, median: null }, H([236]))).toEqual({ where: 5, when: null, total: 5, pending: true });
    // Filling dear before a fall costs money, and says so
    expect(fillSaving({ ...f1, paid: 240 }, H([236, 230, 230, 230, 230, 230, 230, 230, 230]))).toEqual({ where: -2, when: -3, total: -5, pending: false });
  });
  it('uses one base for where and when, so the total is the week-after average less what you paid', () => {
    // Logged at 238 (intraday), the day closed at 236: base 236 → where 5, when 2, total = (240 − 226) × 0.5
    expect(fillSaving({ ...f1, median: 238 }, full)).toEqual({ where: 5, when: 2, total: 7, pending: false });
  });
  it('sums fills', () => {
    const s = summarise([f1, { ...f1, id: 'y', date: '2026-10-07', median: 240, paid: 238 }], full);
    expect(s).toMatchObject({ n: 2, litres: 100, since: '2026-10-01', where: 6, when: 2, total: 8, pending: 1 });
    expect(summarise([], full)).toMatchObject({ n: 0, total: 0, since: null });
  });
  it('confirms a new fill with what it saved against the average', () => {
    expect(loggedText({ paid: 226, litres: 50, median: 236 })).toBe('Logged. 10.0c under the Sydney median, about $5.00 saved.');
    expect(loggedText({ paid: 240, litres: 40, median: 236 })).toBe('Logged. 4.0c over the Sydney median, about $1.60 more.');
    expect(loggedText({ paid: 236, litres: 40, median: 236 })).toBe('Logged. You paid the Sydney median.');
    expect(loggedText({ paid: 236, litres: 40, median: null })).toBe('Logged.');
  });
  it('formats dollars with a real minus sign', () => {
    expect(money(12.4)).toBe('$12.40');
    expect(money(-3.104)).toBe('−$3.10');
    expect(money(-0.001)).toBe('$0.00');
    expect(money(0.005)).toBe('$0.01');
    expect(money(-0.005)).toBe('−$0.01');
  });
});
