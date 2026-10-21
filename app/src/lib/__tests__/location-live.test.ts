// Whether the GPS area is live (Stations: "Near you in Parramatta" vs "Parramatta · last known"). expo-location is mocked.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLoc = {
  fg: 'granted' as string,
  services: true,
  last: null as unknown,
  current: (): Promise<unknown> => Promise.resolve(null),
};
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ status: mockLoc.fg }),
  requestForegroundPermissionsAsync: async () => ({ status: mockLoc.fg }),
  hasServicesEnabledAsync: async () => mockLoc.services,
  getLastKnownPositionAsync: async () => mockLoc.last,
  getCurrentPositionAsync: () => mockLoc.current(),
}));
jest.mock('@/widget/sync', () => ({ requestWidgetRefresh: () => {} }));

const pos = { coords: { latitude: -33.817, longitude: 151.004 }, timestamp: Date.now() };
type Mod = typeof import('../location');
let L: Mod;

beforeEach(() => {
  jest.resetModules();   // the live state is module-level: start each test fresh
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  L = require('../location') as Mod;
  Object.assign(mockLoc, { fg: 'granted', services: true, last: null, current: () => Promise.resolve(null) });
});

describe('GPS area live state', () => {
  it('is unknown until a read answers, then live on a fix', async () => {
    expect(L.getFixLive()).toBeNull();
    mockLoc.last = pos;
    expect(await L.quietLocate()).toMatchObject({ gps: true });
    expect(L.getFixLive()).toBe(true);
  });

  it('turns last-known when permission is withdrawn or location is off', async () => {
    mockLoc.fg = 'denied';
    expect(await L.quietLocate()).toBeNull();
    expect(L.getFixLive()).toBe(false);
    mockLoc.fg = 'granted';
    mockLoc.last = pos;
    await L.quietLocate();
    expect(L.getFixLive()).toBe(true);
    mockLoc.services = false;
    await L.quietLocate();
    expect(L.getFixLive()).toBe(false);
  });

  it('a read that just times out (indoors) leaves it live', async () => {
    mockLoc.last = pos;
    await L.quietLocate();
    mockLoc.last = null;   // no recent fix, and the current one never comes in time
    jest.useFakeTimers();
    const p = L.quietLocate();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await p).toBeNull();
    jest.useRealTimers();
    expect(L.getFixLive()).toBe(true);
  });

  it('a fix from "Use my location" wins over an older read that finds no location', async () => {
    let release!: (v: string) => void;
    const gate = new Promise<string>((ok) => { release = ok; });
    // the quiet read starts first and is slow to learn that permission is gone
    const loc = jest.requireMock('expo-location') as { getForegroundPermissionsAsync: () => Promise<{ status: string }> };
    const orig = loc.getForegroundPermissionsAsync;
    loc.getForegroundPermissionsAsync = async () => ({ status: await gate });
    const quiet = L.quietLocate();
    loc.getForegroundPermissionsAsync = orig;
    mockLoc.last = pos;
    await L.locate();   // the picker's fix lands meanwhile
    expect(L.getFixLive()).toBe(true);
    release('denied');
    await quiet;
    expect(L.getFixLive()).toBe(true);   // the stale "no location" doesn't override the newer fix
  });
});
