// The widget's headless task handler (src/widget/register.android.ts): mode-row taps, deletes and other clicks.
// Storage is an in-memory map; the widget library's native module is stubbed.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { compactForecast, compactStations, type WidgetSnapshot } from '../../widget/logic';
import { widgetTaskHandler } from '../../widget/register.android';
import { MEDIUM } from '../../widget/widgets';
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

function run(over: Partial<WidgetTaskHandlerProps>) {
  const renderWidget = jest.fn();
  const props: WidgetTaskHandlerProps = {
    widgetInfo: { widgetName: MEDIUM, widgetId: ID, width: 320, height: 180, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } },
    widgetAction: 'WIDGET_CLICK',
    renderWidget,
    ...over,
  };
  return widgetTaskHandler(props).then(() => renderWidget);
}

beforeEach(() => {
  mockStore.clear();
  mockStore.set('widget.cache.v1', JSON.stringify(SNAP));
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
    mockStore.delete('widget.cache.v1');
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

  it('WIDGET_DELETED clears the saved mode and draws nothing', async () => {
    mockStore.set(`widget.mode.${ID}`, 'nearest');
    mockStore.set('widget.mode.8', 'cheapest');
    const render = await run({ widgetAction: 'WIDGET_DELETED' });
    expect(mockStore.has(`widget.mode.${ID}`)).toBe(false);
    expect(mockStore.get('widget.mode.8')).toBe('cheapest');
    expect(render).not.toHaveBeenCalled();
  });

  it('a periodic update draws the saved mode, defaulting to Pinned when a pin sells the fuel', async () => {
    let render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(selectedTab(render.mock.calls[0][0])).toEqual(['pinned']);
    mockStore.set(`widget.mode.${ID}`, 'nearest');
    render = await run({ widgetAction: 'WIDGET_UPDATE' });
    expect(selectedTab(render.mock.calls[0][0])).toEqual(['nearest']);
  });
});
