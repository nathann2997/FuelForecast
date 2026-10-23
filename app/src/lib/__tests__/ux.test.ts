// The 0.5.0 UX pieces: rise alerts, the Trends cycle sentence and the small widget's bottom line (Today's best pick was
// removed in the 2026-10-23 design review).
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { alertPlan, alertWorthy, setAlerts, syncAlerts } from '../alerts';
import { cycleSummary } from '../copy';
import type { Forecast, LiveRow } from '../types';
import { buildModel, compactForecast, compactStations, smallBottomLine, type WidgetSnapshot } from '../../widget/logic';
import fixture from './forecast.fixture.json';

const mockStore = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  __esModule: true,
  default: {
    getItemSync: (k: string) => mockStore.get(k) ?? null,
    setItemSync: (k: string, v: string) => void mockStore.set(k, v),
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}));
const mockNotes = {
  scheduled: [] as { identifier: string; trigger: { date: Date } }[],
  cancelled: 0,
  granted: true,
};
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => null,
  getPermissionsAsync: async () => ({ granted: mockNotes.granted, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ granted: mockNotes.granted }),
  cancelScheduledNotificationAsync: async () => void mockNotes.cancelled++,
  scheduleNotificationAsync: async (r: { identifier: string; trigger: { date: Date } }) => (mockNotes.scheduled.push(r), r.identifier),
}));

const F = fixture as unknown as Forecast;
const U91 = F.live.find((r) => r.fuel === 'U91')!;
const row = (over: Partial<LiveRow>): LiveRow => ({ ...U91, ...over });
const ASOF = '2026-10-21';
// p_jump7 0.6 -> rise on day 3 (Sat 24 Oct), as the outlook tests
const RISING = row({ p_jump7: 0.6, d1: 0, d3: 0, d7: 2.5, d14: 13, verdict: { ...U91.verdict, cls: 'up', head: 'Fill up today' } });
const FLAT = row({ p_jump7: 0.01, d1: 0, d3: -1, d7: -2, d14: -3 });

describe('rise alerts', () => {
  const at = (p: { at: Date } | null) => p && [p.at.getDate(), p.at.getHours(), p.at.getMinutes()];
  it('alerts when the verdict says fill up, or a rise is within 2 days; never when no rise is expected', () => {
    expect(alertWorthy(RISING)).toBe(true);
    expect(alertWorthy(row({ ...RISING, verdict: { ...U91.verdict, cls: 'flat' } }))).toBe(false);   // rise in 3 days, calm
    expect(alertWorthy(row({ p_jump7: 0.9, d1: 0, d3: 0, d7: 2, d14: 4, verdict: { ...U91.verdict, cls: 'flat' } }))).toBe(true);   // tomorrow
    expect(alertWorthy(FLAT)).toBe(false);
    expect(alertPlan(FLAT, ASOF, new Date(2026, 9, 21))).toBeNull();
  });
  it('shows at the next 7:30 am, a minute from now during the day from the widget, else next morning', () => {
    expect(at(alertPlan(RISING, ASOF, new Date(2026, 9, 21, 6, 0)))).toEqual([21, 7, 30]);
    expect(at(alertPlan(RISING, ASOF, new Date(2026, 9, 21, 15, 0)))).toEqual([21, 15, 1]);
    expect(at(alertPlan(RISING, ASOF, new Date(2026, 9, 21, 15, 0), false))).toEqual([22, 7, 30]);
    expect(at(alertPlan(RISING, ASOF, new Date(2026, 9, 21, 21, 0)))).toEqual([22, 7, 30]);
    expect(alertPlan(RISING, ASOF, new Date(2026, 9, 21, 9))!.title).toBe('Fill up before Sat 24 Oct');
  });

  beforeEach(() => {
    mockStore.clear();
    mockNotes.scheduled = [];
    mockNotes.cancelled = 0;
    mockNotes.granted = true;
  });
  const day = (d: number, h = 6) => new Date(2026, 9, d, h, 0);
  const asof = (d: number) => `2026-10-${d}`;

  it('sends one alert per cycle even though the rise day moves forward with each forecast', async () => {
    await syncAlerts([RISING], ASOF, { now: day(21) });
    expect(mockNotes.scheduled).toHaveLength(0);   // off by default
    expect(await setAlerts(true)).toBe(true);
    for (let d = 21; d <= 25; d++) await syncAlerts([RISING], asof(d), { now: day(d) });   // same row, new asof each day
    expect(mockNotes.scheduled.map((x) => x.trigger.date.getDate())).toEqual([21]);   // 7:30 on the 21st, then quiet
    for (let d = 27; d <= 28; d++) await syncAlerts([RISING], asof(d), { now: day(d) });   // after the 5-day cooldown
    expect(mockNotes.scheduled.map((x) => x.trigger.date.getDate())).toEqual([21, 27]);
  });
  it('keeps a pending alert at its time, and cancels it if the rise is called off before it shows', async () => {
    await setAlerts(true);
    await syncAlerts([RISING], ASOF, { now: day(21, 22) });   // 10 pm: next morning
    await syncAlerts([RISING], asof(22), { now: day(22, 5) });   // new data at 5 am: same 7:30 slot
    expect(mockNotes.scheduled.map((x) => [x.trigger.date.getDate(), x.trigger.date.getHours()])).toEqual([[22, 7], [22, 7]]);
    await syncAlerts([FLAT], asof(22), { now: day(22, 6) });
    expect(mockStore.get('alerts.state')).toBeUndefined();   // pending one forgotten, so a later rise can alert
    await syncAlerts([RISING], asof(23), { now: day(23, 6) });
    expect(mockNotes.scheduled).toHaveLength(3);
  });
  it('counts a rise seen in the open app as the alert', async () => {
    await setAlerts(true);
    await syncAlerts([RISING], ASOF, { now: day(21, 10), inApp: true });
    await syncAlerts([RISING], asof(22), { now: day(22, 10) });
    expect(mockNotes.scheduled).toHaveLength(0);
  });
  it('switches itself off when notifications are blocked, and stays off when permission is refused', async () => {
    await setAlerts(true);
    mockNotes.granted = false;
    await syncAlerts([RISING], ASOF, { now: day(21) });
    expect(mockNotes.scheduled).toHaveLength(0);
    expect(JSON.parse(mockStore.get('settings.v1')!).alerts).toBe(false);
    expect(await setAlerts(true)).toBe(false);
  });
  it('does nothing without data (the widget task with no snapshot)', async () => {
    await setAlerts(true);
    await syncAlerts([RISING], ASOF, { now: day(21, 22) });
    const n = mockNotes.cancelled;
    await syncAlerts(undefined, undefined, { now: day(22, 5) });
    expect(mockNotes.cancelled).toBe(n);
  });
});

describe('Trends cycle sentence', () => {
  const withStats = (o: Partial<Forecast['stats']>) => ({ ...F, stats: { ...F.stats, ...o }, ctx: { ...F.ctx, asof: ASOF } }) as Forecast;
  it('places Sydney in the cycle', () => {
    const calm = { margin_now: 12, margin_typ: 12, cycle_gap_calm: 35 };
    expect(cycleSummary(withStats({ ...calm, last_restore: '2026-10-20' }))).toMatch(/^Prices have just jumped/);
    expect(cycleSummary(withStats({ ...calm, last_restore: '2026-10-11' }))).toMatch(/^Early in the cycle/);
    expect(cycleSummary(withStats({ ...calm, last_restore: '2026-09-26' }))).toMatch(/^Mid-cycle/);
    expect(cycleSummary(withStats({ ...calm, last_restore: '2026-09-01' }))).toMatch(/^Late in the cycle: 50 days/);
    expect(cycleSummary(withStats({ ...calm, margin_now: 4, last_restore: '2026-10-11' }))).toMatch(/^Late in the cycle/);
    expect(cycleSummary(withStats({ ...calm, last_restore: null }))).toBe('');
  });
});

describe('small widget bottom line', () => {
  const home = { label: 'Parramatta 2150', la: -33.815, lo: 151.003 };
  const st = (id: string, n: string, price: number, age = 0) => ({
    id, n, b: 'B', s: 'S', pc: 2150, la: home.la + 0.01, lo: home.lo, m: 0 as const, p: { U91: [price, age, 'ok', 'Any time', 'r'] as const },
  });
  const snap = (stations: ReturnType<typeof st>[]): WidgetSnapshot => ({
    forecast: compactForecast(F),
    stations: compactStations({ schema: 1, asof: F.asof, suburbs: [], stations: stations as never }),
    fetchedAt: 0,
  });
  const prefs = { fuel: 'U91' as const, home, radiusKm: 5, members: true };
  it('names the cheapest fresh station for you, pinned first', () => {
    const m = buildModel(snap([st('1', 'SHELL NORTH ROCKS', 231), st('2', 'Cheap', 225, 12)]), prefs, ['1', '2'], F.asof);
    expect(m.best).toMatchObject({ price: '231.0', name: 'Shell North Rocks' });   // the 12-day-old price is skipped
    expect(smallBottomLine(m, 170, false)).toEqual({ text: '231.0 · Shell North Rocks', best: true });
  });
  it('falls back to the Sydney forecast with old data or no station', () => {
    const m = buildModel(snap([]), prefs, [], F.asof);
    expect(m.best).toBeNull();
    expect(smallBottomLine(m, 170, false)?.best).toBe(false);
    const old = buildModel(snap([st('1', 'A', 230)]), prefs, [], '2026-12-01');
    expect(old.best).not.toBeNull();
    expect(smallBottomLine(old, 170, false)).toMatchObject({ best: false });
    expect(smallBottomLine(old, 170, false)!.text).toMatch(/as of/);
  });
});
