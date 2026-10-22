// Analytics never sends the home area (coordinates or suburb), and a failing Observe never breaks the app.
import { describe, expect, it, jest } from '@jest/globals';

import { reportError, settingsAttributes, settingsContext, track } from '../analytics';
import { DEFAULTS } from '../settings';

const mockLog = jest.fn<(name: string, opts?: unknown) => void>();
jest.mock('expo-observe', () => ({
  Observe: {
    logEvent: (name: string, opts?: unknown) => mockLog(name, opts),
    reportError: () => { throw new Error('native module missing'); },
    setGlobalAttributes: () => {},
    configure: () => {},
  },
  useObserve: () => ({ markInteractive: () => {} }),
}));

const home = { label: 'Granville', la: -33.83, lo: 151.01, gps: false };

describe('settingsAttributes', () => {
  it('reduces the home area to whether one is set', () => {
    const a = settingsAttributes({ home });
    expect(a).toEqual({ keys: ['home'], hasArea: true });
    expect(JSON.stringify(a)).not.toMatch(/Granville|151\.01|-33\.83/);
    expect(settingsAttributes({ home: null })).toEqual({ keys: ['home'], hasArea: false });
  });

  it('keeps plain values, counts discounts and marks a cleared max price', () => {
    expect(settingsAttributes({ fuel: 'E10', radiusKm: 5, members: true, maxPrice: null, discounts: { Shell: 4, BP: 6 } }))
      .toEqual({ keys: ['fuel', 'radiusKm', 'members', 'maxPrice', 'discounts'], fuel: 'E10', radiusKm: 5, members: true, maxPrice: 'none', discountBrands: 2 });
  });
});

describe('settingsContext', () => {
  it('has no location, only whether there is one', () => {
    const c = settingsContext({ ...DEFAULTS, home: { ...home, gps: true } });
    expect(c).toEqual({ fuel: 'U91', alerts: false, hasArea: true, areaGps: true, discountBrands: 0 });
  });
});

describe('track / reportError', () => {
  it('passes the event through with its severity', () => {
    track('station.pinned', { pins: 3 });
    expect(mockLog).toHaveBeenLastCalledWith('station.pinned', { attributes: { pins: 3 }, severity: 'info' });
  });

  it('swallows a failing native call', () => {
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});
