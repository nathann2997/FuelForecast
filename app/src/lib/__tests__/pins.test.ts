// Pins only ever hold NSW station codes (digits): junk from storage or a crafted fuelforecast:// link is ignored.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStore = new Map<string, string>();
jest.mock('../storage', () => ({
  __esModule: true,
  default: { getItemSync: (k: string) => mockStore.get(k) ?? null, setItemSync: (k: string, v: string) => void mockStore.set(k, v) },
}));

type Mod = typeof import('../pins');
let P: Mod;
beforeEach(() => {
  mockStore.clear();
  jest.resetModules();
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => (P = require('../pins') as Mod);

describe('pins', () => {
  it('drops stored entries that are not station codes', () => {
    mockStore.set('pins.v1', JSON.stringify(['123', 'javascript:alert(1)', '', 45, '../x', '678']));
    load();
    expect(P.getPins()).toEqual(['123', '678']);
  });
  it('ignores a crafted id without an error or a "pins full" signal', () => {
    load();
    expect(P.togglePin('<script>')).toBe(true);
    expect(P.getPins()).toEqual([]);
    expect(P.togglePin('4321')).toBe(true);
    expect(P.getPins()).toEqual(['4321']);
  });
});
