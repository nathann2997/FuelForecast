// The widget's headless task handler (src/widget/register.android.ts): mode-row taps, deletes and other clicks.
// Storage is an in-memory map; the widget library's native module is stubbed.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { CACHE_KEY, OLD_CACHE_KEY, readCache } from '../../widget/data';
import { compactForecast, compactStations, type WidgetSnapshot } from '../../widget/logic';
import { widgetTaskHandler } from '../../widget/register.android';
import { MEDIUM, SMALL } from '../../widget/widgets';
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

const F = fixture as unknown as Forecast;
const home = { label: 'Parramatta 2150', la: -33.815, lo: 151.003 };
const st = (id: string, price: number, dLat: number): Station => ({
  id, n: `Station ${id}`, b: 'B', s: 'S', pc: 2150, la: home.la + dLat, lo: home.lo, m: 0, p: { U91: [price, 0, 'ok', 'Any time', 'r'] },
});
const SNAP: WidgetSnapshot = {
  forecast: compactForecast(F),
  stations: compactStations({ schema: 1, asof: F.asof, suburbs: [], stations: [st('1', 230, 0.01), st('2', 225, 0.02)] }),
  fetchedAt: Date.now(),
};
const ID = 7;

type Node = { props?: Record<string, unknown>; children?: Node[] };
const walk = (n: Node, out: Node[] = []): Node[] => (out.push(n), n.children?.forEach((c) => walk(c, out)), out);
/** The mode-row tab drawn as selected in a rendered widget */
const selectedTab = (rep: unknown) =>
  walk(buildWidgetTree((rep as { light: never }).light) as Node)
    .filter((n) => n.props?.clickAction === 'MODE' && String(n.props?.accessibilityLabel).endsWith('selected'))
    .map((n) => (n.props?.clickActionData as { mode: string }).mode);

/** The fuel chip in a rendered widget: its label and the fuel a tap switches to */
const chip = (rep: unknown) => {
  const node = walk(buildWidgetTree((rep as { light: never }).light) as Node).find((n) => n.props?.clickAction === 'FUEL')!;
  return { label: (node.children?.[0]?.props as { text: string }).text, next: (node.props?.clickActionData as { fuel: string }).fuel };
};

const INFO = { widgetName: MEDIUM, widgetId: ID, width: 320, height: 180, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } };

function run(over: Partial<WidgetTaskHandlerProps>) {
  const renderWidget = jest.fn();
  const props: WidgetTaskHandlerProps = {
    widgetInfo: INFO,
    widgetAction: 'WIDGET_CLICK',
    renderWidget,
    ...over,
  };
  return widgetTaskHandler(props).then(() => renderWidget);
}

beforeEach(() => {
  mockStore.clear();
  mockStore.set(CACHE_KEY, JSON.stringify(SNAP));
  mockStore.set('settings.v1', JSON.stringify({ fuel: 'U91', home, radiusKm: 5 }));
  mockStore.set('pins.v1', JSON.stringify(['2']));
  globalThis.fetch = jest.fn(async () => { throw new Error('offline'); }) as never;
});

describe('widget task handler', () => {
  it('MODE {mode: nearest} saves the mode for that widget and redraws it in nearest mode, without fetching', async () => {
    const render = await run({ clickAction: 'MODE', clickActionData: { mode: 'nearest' } });
    expect(mockStore.get(`widget.mode.${ID}`)).toBe('nearest');
    expect(render).toHaveBeenCalledTimes(1);
    expect(selectedTab(render.mock.calls[0][0])).toEqual(['nearest']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('draws the tapped mode even if saving it fails', async () => {
    const storage = (jest.requireMock('@/lib/storage') as { default: { setItem: unknown } }).default;
    const orig = storage.setItem;
    storage.setItem = async () => { throw new Error('disk full'); };
    try {
      const render = await run({ clickAction: 'MODE', clickActionData: { mode: 'cheapest' } });
      expect(mockStore.has(`widget.mode.${ID}`)).toBe(false);
      expect(selectedTab(render.mock.calls[0][0])).toEqual(['cheapest']);
    } finally {
      storage.setItem = orig;
    }
  });

  it('fetches on a tap only when nothing is cached', async () => {
    mockStore.delete(CACHE_KEY);
    const render = await run({ clickAction: 'MODE', clickActionData: { mode: 'pinned' } });
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);   // offline: still draws (the "Open Bowser" prompt)
  });

  it('a bad or missing mode neither saves nor renders', async () => {
    for (const clickActionData of [{ mode: 'bogus' }, {}, undefined]) {
      const render = await run({ clickAction: 'MODE', clickActionData });
      expect(render).not.toHaveBeenCalled();
    }
    expect(mockStore.has(`widget.mode.${ID}`)).toBe(false);
  });

  it('ignores other clicks', async () => {
    const render = await run({ clickAction: 'SOMETHING_ELSE', clickActionData: { mode: 'nearest' } });
    expect(render).not.toHaveBeenCalled();
    expect(mockStore.has(`widget.mode.${ID}`)).toBe(false);
  });

  it('WIDGET_DELETED clears the saved mode and fuel and draws nothing', async () => {
    mockStore.set(`widget.mode.${ID}`, 'nearest');
    mockStore.set(`widget.fuel.${ID}`, 'E10');
    mockStore.set('widget.mode.8', 'cheapest');
    mockStore.set('widget.fuel.8', 'P98');
    const render = await run({ widgetAction: 'WIDGET_DELETED' });
    expect(mockStore.has(`widget.mode.${ID}`)).toBe(false);
    expect(mockStore.has(`widget.fuel.${ID}`)).toBe(false);
    expect(mockStore.get('widget.mode.8')).toBe('cheapest');
    expect(mockStore.get('widget.fuel.8')).toBe('P98');
    expect(render).not.toHaveBeenCalled();
  });

  it('FUEL {fuel: E10} saves the fuel for that widget and redraws it in E10, without fetching', async () => {
    const render = await run({ clickAction: 'FUEL', clickActionData: { fuel: 'E10' } });
    expect(mockStore.get(`widget.fuel.${ID}`)).toBe('E10');
    expect(render).toHaveBeenCalledTimes(1);
    expect(chip(render.mock.calls[0][0])).toEqual({ label: 'E10 ▾', next: 'P98' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // the app's fuel is untouched
    expect(JSON.parse(mockStore.get('settings.v1')!).fuel).toBe('U91');
  });

  it('draws the tapped fuel even if saving it fails, on the small widget too', async () => {
    const storage = (jest.requireMock('@/lib/storage') as { default: { setItem: unknown } }).default;
    const orig = storage.setItem;
    storage.setItem = async () => { throw new Error('disk full'); };
    try {
      const render = await run({ clickAction: 'FUEL', clickActionData: { fuel: 'DL' }, widgetInfo: { ...INFO, widgetName: SMALL } });
      expect(mockStore.has(`widget.fuel.${ID}`)).toBe(false);
      expect(chip(render.mock.calls[0][0])).toEqual({ label: 'Diesel ▾', next: 'U91' });
    } finally {
      storage.setItem = orig;
    }
  });

  it("tapping back to the app's fuel removes the widget's own, so it follows the app again", async () => {
    mockStore.set(`widget.fuel.${ID}`, 'DL');
    const render = await run({ clickAction: 'FUEL', clickActionData: { fuel: 'U91' } });
    expect(mockStore.has(`widget.fuel.${ID}`)).toBe(false);
    expect(chip(render.mock.calls[0][0]).label).toBe('U91 ▾');
    mockStore.set('settings.v1', JSON.stringify({ fuel: 'E10', home, radiusKm: 5 }));
    const again = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(chip(again.mock.calls[0][0]).label).toBe('E10 ▾');
  });

  it('a bad or missing fuel neither saves nor renders', async () => {
    for (const clickActionData of [{ fuel: 'LPG' }, {}, undefined]) {
      const render = await run({ clickAction: 'FUEL', clickActionData });
      expect(render).not.toHaveBeenCalled();
    }
    expect(mockStore.has(`widget.fuel.${ID}`)).toBe(false);
  });

  it('a redraw uses the saved fuel, else the app\'s', async () => {
    let render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(chip(render.mock.calls[0][0]).label).toBe('U91 ▾');
    mockStore.set(`widget.fuel.${ID}`, 'P98');
    render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(chip(render.mock.calls[0][0]).label).toBe('P98 ▾');
  });

  it('falls back to the v1 cache (4-item prices, no forecast) when v2 is missing, e.g. offline right after the OTA', async () => {
    mockStore.delete(CACHE_KEY);
    const v1 = {
      ...SNAP,
      stations: { ...SNAP.stations!, stations: SNAP.stations!.stations.map((s) => ({ ...s, p: { U91: s.p.U91!.slice(0, 4) } })) },
    };
    mockStore.set(OLD_CACHE_KEY, JSON.stringify(v1));
    expect(readCache()?.stations?.stations).toHaveLength(2);
    const render = await run({ widgetAction: 'WIDGET_UPDATE' });
    const texts = walk(buildWidgetTree((render.mock.calls[0][0] as { light: never }).light) as Node).map((n) => n.props?.text);
    expect(texts).not.toContain('Open Bowser');
    expect(texts).toContain('225.0');          // yesterday's station price still shows
    expect(texts.some((x) => String(x).startsWith('→'))).toBe(false);   // without a forecast
    // v2 wins once it exists
    mockStore.set(CACHE_KEY, JSON.stringify({ ...SNAP, fetchedAt: 42 }));
    expect(readCache()?.fetchedAt).toBe(42);
  });

  it('a periodic update draws the saved mode, defaulting to Pinned when a pin sells the fuel', async () => {
    let render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(selectedTab(render.mock.calls[0][0])).toEqual(['pinned']);
    mockStore.set(`widget.mode.${ID}`, 'nearest');
    render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(selectedTab(render.mock.calls[0][0])).toEqual(['nearest']);
  });
});
