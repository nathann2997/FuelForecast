// The widget's live location: origin resolution (pure) and the headless handler's location paths (periodic last-known
// read, ⟳ LOCATE fresh fix with its timeout and fallback, permission denied, typed suburb). expo-location is mocked.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { CACHE_KEY } from '../../widget/data';
import {
  FIX_KEY, FIX_MAX_AGE_MS, LIVE_LABEL, buildModel, compactForecast, compactStations, resolveOrigin, type WidgetSnapshot,
} from '../../widget/logic';
import { LAST_KNOWN, LOCATE_TIMEOUT_MS, toFix } from '../../widget/location';
import { widgetTaskHandler } from '../../widget/register.android';
import { MEDIUM, renderWidgetFor } from '../../widget/widgets';
import type { Forecast, Station } from '../types';
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
jest.mock('react-native-android-widget/src/NativeAndroidWidget', () => ({ __esModule: true, default: {} }));

type Pos = { coords: { latitude: number; longitude: number }; timestamp: number } | null;
const mockLoc = {
  bg: 'granted' as string,
  last: null as Pos,
  current: (): Promise<Pos> => Promise.resolve(null),
  calls: { bg: 0, last: 0, current: 0 },
  lastOpts: null as unknown,
};
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getBackgroundPermissionsAsync: async () => (mockLoc.calls.bg++, { status: mockLoc.bg }),
  getLastKnownPositionAsync: async (o: unknown) => (mockLoc.calls.last++, (mockLoc.lastOpts = o), mockLoc.last),
  getCurrentPositionAsync: () => (mockLoc.calls.current++, mockLoc.current()),
}));

const F = fixture as unknown as Forecast;
// Home area in Parramatta; the phone is actually in Bondi (~25 km away)
const PARRA = { la: -33.815, lo: 151.003 };
const BONDI = { la: -33.891, lo: 151.274 };
const pos = (p: { la: number; lo: number }, timestamp = Date.now()): Pos => ({ coords: { latitude: p.la, longitude: p.lo }, timestamp });
const st = (id: string, price: number, at: { la: number; lo: number }, dLat: number): Station => ({
  id, n: `Station ${id}`, b: 'B', s: 'S', pc: 2000, la: at.la + dLat, lo: at.lo, m: 0, p: { U91: [price, 0, 'ok', 'Any time', 'r'] },
});
const SNAP: WidgetSnapshot = {
  forecast: compactForecast(F),
  stations: compactStations({
    schema: 1, asof: F.asof, suburbs: [],
    stations: [st('p1', 230, PARRA, 0.005), st('p2', 228, PARRA, 0.01), st('b1', 240, BONDI, 0.005), st('b2', 238, BONDI, 0.01)],
  }),
  fetchedAt: Date.now(),
};
const ID = 9;
const INFO = { widgetName: MEDIUM, widgetId: ID, width: 320, height: 220, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } };

type Node = { type?: string; props?: Record<string, unknown>; children?: Node[] };
const walk = (n: Node, out: Node[] = []): Node[] => (out.push(n), n.children?.forEach((c) => walk(c, out)), out);
const drawn = (rep: unknown) => walk(buildWidgetTree((rep as { light: never }).light) as Node);
const rowIds = (nodes: Node[]) =>
  nodes.filter((n) => String((n.props?.clickActionData as { uri?: string })?.uri ?? '').includes('/station/'))
    .map((n) => String((n.props?.clickActionData as { uri: string }).uri).split('/').pop());
const hasLocate = (nodes: Node[]) => nodes.some((n) => n.props?.clickAction === 'LOCATE');
const texts = (nodes: Node[]) => nodes.map((n) => n.props?.text).filter(Boolean);

function run(over: Partial<WidgetTaskHandlerProps>) {
  const renderWidget = jest.fn();
  return widgetTaskHandler({ widgetInfo: INFO, widgetAction: 'WIDGET_UPDATE', renderWidget, ...over }).then(() => renderWidget);
}
const settings = (home: unknown) => mockStore.set('settings.v1', JSON.stringify({ fuel: 'U91', home, radiusKm: 5 }));

beforeEach(() => {
  mockStore.clear();
  mockStore.set(CACHE_KEY, JSON.stringify(SNAP));
  mockStore.set(`widget.mode.${ID}`, 'nearest');
  settings({ label: 'your location', ...PARRA, gps: true });
  mockLoc.bg = 'granted';
  mockLoc.last = null;
  mockLoc.current = () => Promise.resolve(null);
  mockLoc.calls = { bg: 0, last: 0, current: 0 };
  globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as never;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('resolveOrigin', () => {
  const now = 1_000_000_000;
  const gpsHome = { label: 'your location', ...PARRA, gps: true };
  const typed = { label: 'Parramatta 2150', ...PARRA };
  const fix = { ...BONDI, at: now - 60_000 };
  it('uses a recent fix when background location is granted and the area is GPS-based or unset', () => {
    for (const home of [gpsHome, null]) {
      const o = resolveOrigin(home, true, fix, now);
      expect(o).toEqual({ origin: { label: LIVE_LABEL, ...BONDI, gps: true }, live: true, canLocate: true });
    }
  });
  it('never overrides a typed suburb', () => {
    expect(resolveOrigin(typed, true, fix, now)).toEqual({ origin: typed, live: false, canLocate: false });
  });
  it('falls back to the saved area when permission is denied', () => {
    expect(resolveOrigin(gpsHome, false, fix, now)).toEqual({ origin: gpsHome, live: false, canLocate: false });
    expect(resolveOrigin(null, false, fix, now)).toEqual({ origin: null, live: false, canLocate: false });
  });
  it('ignores a stale or missing fix (but still offers ⟳)', () => {
    expect(resolveOrigin(gpsHome, true, { ...BONDI, at: now - FIX_MAX_AGE_MS - 1 }, now)).toEqual({ origin: gpsHome, live: false, canLocate: true });
    expect(resolveOrigin(gpsHome, true, null, now)).toEqual({ origin: gpsHome, live: false, canLocate: true });
    expect(resolveOrigin(null, true, null, now).origin).toBeNull();
  });
  it('captions a live fix "near you"', () => {
    const snap = SNAP;
    const prefs = { fuel: 'U91' as const, home: { label: LIVE_LABEL, ...BONDI, gps: true }, radiusKm: 5, members: true };
    expect(buildModel(snap, prefs, [], F.asof, 10, 'nearest').caption).toBe('Nearest to you');
    expect(buildModel(snap, prefs, [], F.asof, 10, 'cheapest').caption).toBe('Cheapest near you');
    expect(buildModel(snap, { ...prefs, home: { label: 'Parramatta 2150', ...PARRA } }, [], F.asof, 10, 'cheapest').caption).toBe('Cheapest near Parramatta 2150');
  });
});

describe('widget handler location', () => {
  it('a periodic update reads the last-known position (no GPS wake-up), stores it and lists stations near it', async () => {
    mockLoc.last = pos(BONDI);
    const render = await run({});
    expect(mockLoc.calls.last).toBe(1);
    expect(mockLoc.calls.current).toBe(0);
    expect(JSON.parse(mockStore.get(FIX_KEY)!)).toMatchObject(BONDI);
    const nodes = drawn(render.mock.calls[0][0]);
    expect(rowIds(nodes)).toEqual(['b1', 'b2']);
    expect(texts(nodes)).toContain('Nearest to you');
    expect(hasLocate(nodes)).toBe(true);
  });

  it('reuses the stored fix when there is no new one', async () => {
    mockStore.set(FIX_KEY, JSON.stringify({ ...BONDI, at: Date.now() - 60_000 }));
    const render = await run({});
    expect(rowIds(drawn(render.mock.calls[0][0]))).toEqual(['b1', 'b2']);
  });

  it('⟳ LOCATE gets a fresh fix, stores it and redraws without fetching', async () => {
    mockLoc.current = () => Promise.resolve(pos(BONDI));
    const render = await run({ widgetAction: 'WIDGET_CLICK', clickAction: 'LOCATE', clickActionData: {} });
    expect(mockLoc.calls.current).toBe(1);
    expect(JSON.parse(mockStore.get(FIX_KEY)!)).toMatchObject(BONDI);
    expect(rowIds(drawn(render.mock.calls[0][0]))).toEqual(['b1', 'b2']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('⟳ falls back to the last-known position after the 8 s timeout', async () => {
    jest.useFakeTimers();
    mockLoc.current = () => new Promise<Pos>(() => {});   // never answers
    mockLoc.last = pos(BONDI);
    const done = run({ widgetAction: 'WIDGET_CLICK', clickAction: 'LOCATE', clickActionData: {} });
    await jest.advanceTimersByTimeAsync(LOCATE_TIMEOUT_MS);
    const render = await done;
    expect(mockLoc.calls.last).toBe(1);
    expect(rowIds(drawn(render.mock.calls[0][0]))).toEqual(['b1', 'b2']);
  });

  it('⟳ with no fix at all keeps the saved area', async () => {
    jest.useFakeTimers();
    mockLoc.current = () => Promise.reject(new Error('location off'));
    const done = run({ widgetAction: 'WIDGET_CLICK', clickAction: 'LOCATE', clickActionData: {} });
    await jest.advanceTimersByTimeAsync(LOCATE_TIMEOUT_MS);
    const render = await done;
    expect(mockStore.has(FIX_KEY)).toBe(false);
    expect(rowIds(drawn(render.mock.calls[0][0]))).toEqual(['p1', 'p2']);
  });

  it('permission denied: no location reads, no ⟳, the saved area', async () => {
    mockLoc.bg = 'denied';
    mockLoc.last = pos(BONDI);
    mockStore.set(FIX_KEY, JSON.stringify({ ...BONDI, at: Date.now() }));   // an old fix from when it was granted
    for (const over of [{}, { widgetAction: 'WIDGET_CLICK' as const, clickAction: 'LOCATE', clickActionData: {} }]) {
      const render = await run(over);
      const nodes = drawn(render.mock.calls[0][0]);
      expect(rowIds(nodes)).toEqual(['p1', 'p2']);
      expect(hasLocate(nodes)).toBe(false);
    }
    expect(mockLoc.calls.last + mockLoc.calls.current).toBe(0);
    expect(mockStore.has(FIX_KEY)).toBe(false);   // N1: the old coordinates are deleted
  });

  it('a typed suburb is respected: no location reads, no ⟳', async () => {
    mockStore.set(FIX_KEY, JSON.stringify({ ...BONDI, at: Date.now() }));
    settings({ label: 'Parramatta 2150', ...PARRA });
    mockLoc.last = pos(BONDI);
    const render = await run({});
    const nodes = drawn(render.mock.calls[0][0]);
    expect(mockLoc.calls.last + mockLoc.calls.current).toBe(0);
    expect(rowIds(nodes)).toEqual(['p1', 'p2']);
    expect(texts(nodes)).toContain('Nearest to Parramatta 2150');
    expect(hasLocate(nodes)).toBe(false);
    expect(mockStore.has(FIX_KEY)).toBe(false);   // N1: deleted for a typed suburb too
  });

  it('deletes the fix even on taps that skip location reads, once permission is withdrawn', async () => {
    mockStore.set(FIX_KEY, JSON.stringify({ ...BONDI, at: Date.now() }));
    mockLoc.bg = 'denied';
    await run({ widgetAction: 'WIDGET_CLICK', clickAction: 'MODE', clickActionData: { mode: 'cheapest' } });
    expect(mockStore.has(FIX_KEY)).toBe(false);
    expect(mockLoc.calls.last + mockLoc.calls.current).toBe(0);
  });

  it('asks for last-known fixes up to 30 min old within 3 km, so approximate-location users get them (S1)', async () => {
    expect(LAST_KNOWN).toEqual({ maxAge: 30 * 60 * 1000, requiredAccuracy: 3000 });
    mockLoc.last = pos(BONDI);
    await run({});
    expect(mockLoc.lastOpts).toEqual({ maxAge: 30 * 60 * 1000, requiredAccuracy: 3000 });
  });

  it("stamps a fix with the position's own time, so an old last-known position ages out on time (N2)", async () => {
    const now = Date.now();
    const measured = now - 30 * 60 * 1000;
    mockLoc.last = pos(BONDI, measured);
    await run({});
    expect(JSON.parse(mockStore.get(FIX_KEY)!).at).toBe(measured);
    // measured 6 h + 1 min ago: not live, even though it was read just now
    expect(resolveOrigin({ label: 'x', ...PARRA, gps: true }, true, toFix(pos(BONDI, now - FIX_MAX_AGE_MS - 60_000) as never, now), now).live).toBe(false);
    // a missing or future timestamp falls back to / is capped at now
    expect(toFix({ coords: { latitude: 1, longitude: 2 }, timestamp: now + 5000 } as never, now)!.at).toBe(now);
    expect(toFix({ coords: { latitude: 1, longitude: 2 } } as never, now)!.at).toBe(now);
  });

  it('no area set: a live fix fills in; without one the prompt stays', async () => {
    settings(null);
    let render = await run({});
    expect(texts(drawn(render.mock.calls[0][0]))).toContain('Open Bowser to set your area');
    mockLoc.last = pos(BONDI);
    render = await run({});
    expect(rowIds(drawn(render.mock.calls[0][0]))).toEqual(['b1', 'b2']);
  });

  it('mode and fuel taps and resizes stay instant: no location reads', async () => {
    mockLoc.last = pos(BONDI);
    await run({ widgetAction: 'WIDGET_CLICK', clickAction: 'MODE', clickActionData: { mode: 'cheapest' } });
    await run({ widgetAction: 'WIDGET_CLICK', clickAction: 'FUEL', clickActionData: { fuel: 'E10' } });
    await run({ widgetAction: 'WIDGET_RESIZED' });
    expect(mockLoc.calls.last + mockLoc.calls.current).toBe(0);
  });
});

describe('⟳ button rendering', () => {
  const base = buildModel(SNAP, { fuel: 'U91', home: { label: 'x', ...PARRA }, radiusKm: 5, members: true }, [], F.asof, 10, 'nearest');
  for (const height of [110, 150, 180, 220])
    it(`shows only when the widget may locate, keeping the list rule (${height} dp)`, () => {
      for (const canLocate of [true, false]) {
        const nodes = drawn(renderWidgetFor(MEDIUM, { height, width: 250 }, { ...base, canLocate }));
        expect(hasLocate(nodes)).toBe(canLocate);
        const list = nodes.find((n) => n.type === 'ListWidget');
        if (list) expect(list.props?.height as number).toBeGreaterThanOrEqual(height < 166 ? 28 : 44);
      }
    });
});
