// The widget library builds widgets by calling our components as plain functions, outside React. If the React
// Compiler rewrites them they call a hook there and the widget renders blank (shipped in 0.3.0). Guard both halves.
import { describe, expect, it, jest } from '@jest/globals';
import { transformFileSync } from '@babel/core';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';

import {
  buildModel, compactStations, FUEL_ACTION, mediumLayout, MAX_ROWS, MODE_ACTION, nextFuel, STATION_MODES, type StationMode, type WidgetPrefs, type WidgetSnapshot,
} from '../../widget/logic';
import { MEDIUM, SMALL, renderWidgetFor } from '../../widget/widgets';
import type { Forecast, Station, Stations } from '../types';
import fixture from './forecast.fixture.json';

jest.mock('react-native-android-widget/src/NativeAndroidWidget', () => ({ __esModule: true, default: {} }));

const WIDGET_DIR = 'src/widget';   // jest runs from app/
// node's fs, typed locally (the app has no @types/node)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync } = require('fs') as { readdirSync: (dir: string) => string[] };

type Node = { type?: string; props?: Record<string, unknown>; children?: Node[] };
const walk = (n: Node, out: Node[] = []): Node[] => {
  out.push(n);
  n.children?.forEach((c) => walk(c, out));
  return out;
};

describe('widget rendering', () => {
  // Every component file under src/widget, so a new widget .tsx can't skip the directive
  const tsx = readdirSync(WIDGET_DIR).filter((f) => f.endsWith('.tsx'));
  it('finds the widget component files', () => expect(tsx).toContain('widgets.tsx'));
  for (const f of tsx)
    it(`${f} is not rewritten by the React Compiler`, () => {
      const file = `${WIDGET_DIR}/${f}`;
      const out = transformFileSync(file, {
        filename: file, babelrc: false, configFile: false,
        presets: [['babel-preset-expo', { 'react-compiler': {} }]],
        caller: { name: 'metro', platform: 'android', bundler: 'metro', supportsReactCompiler: true, isDev: false } as never,
      })?.code ?? '';
      expect(out).not.toMatch(/compiler-runtime|useMemoCache/);
    });

  const asof = (fixture as Forecast).asof;
  const home = { label: 'Parramatta 2150', la: -33.815, lo: 151.003 };
  const st = (id: string, price: number, dLat: number): Station => ({
    id, n: `Station ${id}`, b: 'B', s: 'S', pc: 2150, la: home.la + dLat, lo: home.lo, m: 0, p: { U91: [price, 0, 'ok', 'Any time', 'r'] },
  });
  const stations: Stations = { schema: 1, asof, suburbs: [], stations: [st('1', 230, 0.01), st('2', 225, 0.02), st('3', 240, 0.005)] };
  const full: WidgetSnapshot = { forecast: { asof, live: (fixture as unknown as Forecast).live }, stations: compactStations(stations), fetchedAt: 0 };
  const prefs: WidgetPrefs = { fuel: 'U91', home, radiusKm: 5, members: true };
  const cases: [string, WidgetSnapshot | null, WidgetPrefs, string[]][] = [
    ['no data', null, prefs, []],
    ['U91 with data', full, prefs, ['2']],
    ['P98, no station sells it', full, { ...prefs, fuel: 'P98' }, ['2']],
    ['no area, no pins', full, { ...prefs, home: null }, []],
  ];

  const build = (name: string, height: number, snap: WidgetSnapshot | null, p: WidgetPrefs, pins: string[], mode?: StationMode) => {
    const model = buildModel(snap, p, pins, asof, MAX_ROWS, mode);
    const rep = renderWidgetFor(name, { height }, model) as { light: never; dark: never };
    return { model, light: buildWidgetTree(rep.light) as Node, dark: buildWidgetTree(rep.dark) as Node };
  };
  const chipOf = (nodes: Node[]) => nodes.filter((n) => n.props?.clickAction === FUEL_ACTION);

  for (const [label, snap, p, pins] of cases) {
    it(`${SMALL} builds a tree outside React, with a fuel chip (${label})`, () => {
      const t = build(SMALL, 180, snap, p, pins);
      for (const tree of [t.light, t.dark]) {
        expect(tree.children?.length).toBeGreaterThan(0);
        expect(chipOf(walk(tree)).map((n) => n.props?.clickActionData)).toEqual([{ fuel: nextFuel(p.fuel) }]);
        expect(walk(tree).some((n) => n.type === 'ListWidget')).toBe(false);
      }
    });
    for (const [mode] of STATION_MODES)
      for (const height of [0, 60, 80, 110, 150, 180, 220])
        it(`${MEDIUM} builds in ${mode} mode at ${height} dp (${label})`, () => {
          const t = build(MEDIUM, height, snap, p, pins, mode);
          const { listH } = mediumLayout(height, t.model.rows.length);
          for (const tree of [t.light, t.dark]) {
            const nodes = walk(tree);
            // the mode row: three MODE tabs, the selected one labelled as such
            const tabs = nodes.filter((n) => n.props?.clickAction === MODE_ACTION);
            expect(tabs.map((n) => (n.props?.clickActionData as { mode: string }).mode)).toEqual(STATION_MODES.map(([m]) => m));
            expect(tabs.filter((n) => String(n.props?.accessibilityLabel).endsWith('selected'))).toHaveLength(1);
            // the fuel chip cycles to the next fuel
            expect(chipOf(nodes).map((n) => n.props?.clickActionData)).toEqual([{ fuel: nextFuel(p.fuel) }]);
            const lists = nodes.filter((n) => n.type === 'ListWidget');
            const links = nodes.filter((n) => String((n.props?.clickActionData as { uri?: string })?.uri ?? '').includes('/station/'));
            if (t.model.rows.length && listH != null) {
              // one scrollable list with a numeric height >= 28, holding every row; each item deep-links on its own
              // root (no nested clicks)
              expect(lists).toHaveLength(1);
              expect(typeof lists[0].props?.height).toBe('number');
              expect(lists[0].props?.height as number).toBeGreaterThanOrEqual(28);
              const items = lists[0].children ?? [];
              expect(items.map((n) => (n.props?.clickActionData as { uri: string }).uri)).toEqual(t.model.rows.map((r) => r.uri));
              for (const item of items) expect(walk(item).slice(1).some((n) => n.props?.clickAction)).toBe(false);
            } else if (t.model.rows.length) {
              // too short for a list: the first station as a plain row that still deep-links
              expect(lists).toHaveLength(0);
              expect(links.map((n) => (n.props?.clickActionData as { uri: string }).uri)).toEqual([t.model.rows[0].uri]);
            } else {
              expect(lists).toHaveLength(0);
              expect(nodes.some((n) => n.props?.text === t.model.message)).toBe(true);
            }
            if (height <= 80) expect(lists).toHaveLength(0);
            if (snap && p.home && p.fuel === 'U91') expect(t.model.rows.length).toBeGreaterThanOrEqual(1);
          }
        });
  }
});
