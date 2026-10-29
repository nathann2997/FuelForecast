// What reaches PostHog: nothing personal, only from the foreground, nothing without a key or when switched off, and
// opens carry what brought the app to the front.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Opts = Record<string, unknown> & { before_send?: (e: unknown) => unknown };
const mockCapture = jest.fn<(name: string, props?: Record<string, unknown>) => void>();
const mockRegister = jest.fn<(p: Record<string, unknown>) => Promise<void>>(async () => {});
const mockScreen = jest.fn<(n: string) => Promise<void>>(async () => {});
const mockOptIn = jest.fn<() => Promise<void>>(async () => {});
const mockOptOut = jest.fn<() => Promise<void>>(async () => {});
const mockCtor = jest.fn<(key: string, opts: Opts) => void>();
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: class {
    optedOut = false;
    constructor(key: string, opts: Opts) { mockCtor(key, opts); }
    capture(n: string, p?: Record<string, unknown>) { mockCapture(n, p); }
    register(p: Record<string, unknown>) { return mockRegister(p); }
    screen(n: string) { return mockScreen(n); }
    optIn() { return mockOptIn(); }
    optOut() { return mockOptOut(); }
  },
}));
jest.mock('expo-observe', () => ({
  Observe: { logEvent: () => {}, reportError: () => {}, setGlobalAttributes: () => {}, configure: () => {} },
  useObserve: () => ({ markInteractive: () => {} }),
}));

jest.mock('expo-updates', () => ({ channel: 'preview' }));

let mockAppState = 'active';
jest.mock('react-native', () => ({
  AppState: { get currentState() { return mockAppState; } },
  Platform: { OS: 'android' },
}));

type Mod = typeof import('../analytics');
process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
function load(): Mod {
  let m!: Mod;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  jest.isolateModules(() => { m = require('../analytics'); });
  return m;
}

beforeEach(() => {
  mockAppState = 'active';
  [mockCapture, mockRegister, mockScreen, mockOptIn, mockOptOut, mockCtor].forEach((f) => f.mockClear());
});

describe('starting PostHog', () => {
  it('is configured for anonymous installs, no IP location, one open event, no crash capture', () => {
    const a = load();
    a.startProductAnalytics(true);
    const [key, o] = mockCtor.mock.calls[0];
    expect(key).toBe('phc_test');
    expect(o).toMatchObject({ personProfiles: 'always', disableGeoip: true, captureAppLifecycleEvents: false, errorTracking: { autocapture: false } });
    expect((o.customAppProperties as (p: object) => object)({ $timezone: 'Australia/Sydney', $app_version: '0.9.0' })).toEqual({ $app_version: '0.9.0' });
    expect(mockOptIn).toHaveBeenCalled();   // the setting wins over an opt-out the SDK stored earlier
  });

  // (Without a key it never starts; Expo's Babel preset inlines EXPO_PUBLIC_ variables at compile time, so that isn't
  // reproducible here by changing process.env)
  it('starts once, and only in front', () => {
    mockAppState = 'background';
    const a = load();
    expect(a.startProductAnalytics(true)).toBe(false);   // a widget task or background refresh
    mockAppState = 'active';
    a.startProductAnalytics(true);
    a.startProductAnalytics(true);
    expect(mockCtor).toHaveBeenCalledTimes(1);
  });

  it('never contacts PostHog while Share anonymous usage is off', () => {
    const a = load();
    a.configureAnalytics(false);
    expect(a.startProductAnalytics(false)).toBe(false);
    a.track('station.pinned', { pins: 1 });
    expect(mockCtor).not.toHaveBeenCalled();
    a.setUsageSharing(true);
    expect(mockCtor).toHaveBeenCalledTimes(1);
    a.setUsageSharing(false);
    expect(mockOptOut).toHaveBeenCalled();
    a.track('station.pinned', { pins: 2 });
    expect(mockCapture).not.toHaveBeenCalledWith('station.pinned', { pins: 2 });
  });
});

describe('events', () => {
  it('respect Share anonymous usage outside the app too (the flag the saved settings set at load)', () => {
    const a = load();
    a.startProductAnalytics(true);
    a.setSharingFlag(false);   // what settings.ts does when the saved setting is off, e.g. in the widget task
    a.track('settings.changed', { keys: ['alerts'] });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('logged before start are sent on start; after that they go straight through', () => {
    const a = load();
    a.track('station.pinned', { pins: 1 });
    expect(mockCapture).not.toHaveBeenCalled();
    a.startProductAnalytics(true);
    expect(mockCapture).toHaveBeenCalledWith('station.pinned', { pins: 1 });
    a.track('station.pinned', { pins: 2 });
    expect(mockCapture).toHaveBeenLastCalledWith('station.pinned', { pins: 2 });
  });

  it('are marked only when a background task logs them, not when Android pauses for a dialog', async () => {
    const a = load();
    a.startProductAnalytics(true);
    mockAppState = 'background';   // e.g. Maps opened on top: still the person's action
    a.track('directions.opened', { ok: true });
    expect(mockCapture).toHaveBeenLastCalledWith('directions.opened', { ok: true });
    await a.inBackgroundTask(async () => a.track('settings.changed', { keys: ['alerts'] }));
    expect(mockCapture).toHaveBeenLastCalledWith('settings.changed', { keys: ['alerts'], background: true });
  });

  it('carry the settings context, never the area', () => {
    const a = load();
    a.startProductAnalytics(true);
    const s = { fuel: 'E10', alerts: true, home: { label: 'Granville', la: -33.83, lo: 151.01 }, discounts: {}, internal: false } as unknown as Parameters<Mod['settingsContext']>[0];
    a.setContext(a.settingsContext(s));
    const sent = JSON.stringify(mockRegister.mock.calls);
    expect(sent).toContain('"hasArea":true');
    expect(sent).not.toMatch(/Granville|151\.01|-33\.83/);
  });

  it('before_send strips anything personal and keeps GeoIP off', () => {
    const a = load();
    a.startProductAnalytics(true);
    const before = mockCtor.mock.calls[0][1].before_send!;
    const e = before({
      event: 'x', $set: { a: 1 }, $set_once: { b: 2 },
      properties: { $geoip_disable: true, $ip: '1.2.3.4', $geoip_city_name: 'Sydney', $timezone: 'Australia/Sydney', la: 1, lo: 2, home: 'x', suburb: 'Bondi', paid: 199.9, fuel: 'E10', verdict: 'act' },
    }) as { properties: Record<string, unknown>; $set?: unknown; $set_once?: unknown };
    expect(e.properties).toEqual({ $geoip_disable: true, fuel: 'E10', verdict: 'act' });
    expect(e.$set).toBeUndefined();
    expect(e.$set_once).toBeUndefined();
    expect((before({ event: 'y', properties: {} }) as { properties: object }).properties).toEqual({ $geoip_disable: true });
  });
});

describe('screens and opens', () => {
  it('names screens by route pattern, and resends the current one on start', () => {
    const a = load();
    expect(a.routePattern(['(tabs)'])).toBe('/');
    expect(a.routePattern(['(tabs)', 'stations'])).toBe('/stations');
    expect(a.routePattern(['station', '[id]'])).toBe('/station/[id]');
    a.screen('/stations', { view: 'map' });
    a.startProductAnalytics(true);
    expect(mockScreen).toHaveBeenCalledWith('/stations');
  });

  it('reads the source of a link', () => {
    const a = load();
    expect(a.linkSource('fuelforecast://?src=widget')).toBe('widget');
    expect(a.linkSource('fuelforecast://station/123?src=share')).toBe('share');
    expect(a.linkSource('fuelforecast://station/123')).toBe('link');
    expect(a.linkSource('https://example.com')).toBeNull();
    expect(a.linkSource(null)).toBeNull();
  });

  it('logs one open with its source, then forgets it; none while restarting into an update', async () => {
    const a = load();
    a.startProductAnalytics(true);
    a.noteOpenSource('widget');
    await a.logOpen(true);
    expect(mockCapture).toHaveBeenLastCalledWith('app.opened', { source: 'widget', cold: true });
    await a.logOpen(false);
    expect(mockCapture).toHaveBeenLastCalledWith('app.opened', { source: 'launcher', cold: false });
    mockCapture.mockClear();
    await a.logOpen(true, Promise.resolve(), Promise.resolve(true));
    expect(mockCapture).not.toHaveBeenCalled();
    a.noteOpenSource('alert');
    a.clearOpenSource();   // went to the background before an open was logged
    await a.logOpen(false);
    expect(mockCapture).toHaveBeenLastCalledWith('app.opened', { source: 'launcher', cold: false });
  });
});
