// The widget library builds widgets by calling our components as plain functions, outside React. If the React
// Compiler rewrites them they call a hook there and the widget renders blank (shipped in 0.3.0). Guard both halves.
import { describe, expect, it, jest } from '@jest/globals';
import { transformFileSync } from '@babel/core';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';

import {
  buildModel, compactStations, FUEL_ACTION, mediumLayout, MAX_ROWS, MODE_ACTION, nextFuel, STATION_MODES, type StationMode, type WidgetPrefs, type WidgetSnapshot,
} from '../../widget/logic';
import { MEDIUM, SMALL, renderWidgetFor } from '../../widget/widgets';
import type { Forecast, Station } from '../types';
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
  // fc: the station's 7-day forecast (stations.json index 5), absent in older files
  const st = (id: string, price: number, dLat: number, fc?: number): Station => ({
    id, n: `Station ${id}`, b: 'B', s: 'S', pc: 2150, la: home.la + dLat, lo: home.lo, m: 0,
    p: { U91: (fc == null ? [price, 0, 'by', 'Fill by Fri 23 Oct', 'r'] : [price, 0, 'by', 'Fill by Fri 23 Oct', 'r', fc]) as never },
  });
  const live = (fixture as unknown as Forecast).live;
  const snapOf = (withFc: boolean): WidgetSnapshot => ({
    forecast: { asof, live },
    stations: compactStations({ schema: 1, asof, suburbs: [], stations: [st('1', 230, 0.01, withFc ? 232 : undefined), st('2', 225, 0.02, withFc ? 224 : undefined), st('3', 240, 0.005, withFc ? 240.2 : undefined)] }),
    fetchedAt: 0,
  });
  const full = snapOf(true);
  const prefs: WidgetPrefs = { fuel: 'U91', home, radiusKm: 5, members: true };
  const cases: [string, WidgetSnapshot | null, WidgetPrefs, string[]][] = [
    ['no data', null, prefs, []],
    ['U91 with forecasts', full, prefs, ['2']],
    ['U91 without forecasts (old data)', snapOf(false), prefs, ['2']],
    ['U91, no outlook row for the fuel', { ...full, forecast: { asof, live: live.filter((r) => r.fuel !== 'U91') } }, prefs, ['2']],
    ['P98, no station sells it', full, { ...prefs, fuel: 'P98' }, ['2']],
    ['no area, no pins', full, { ...prefs, home: null }, []],
  ];

  const build = (name: string, height: number, snap: WidgetSnapshot | null, p: WidgetPrefs, pins: string[], mode?: StationMode, width = 320) => {
    const model = buildModel(snap, p, pins, asof, MAX_ROWS, mode);
    const rep = renderWidgetFor(name, { height, width }, model) as { light: never; dark: never };
    return { model, light: buildWidgetTree(rep.light) as Node, dark: buildWidgetTree(rep.dark) as Node };
  };
  const chipOf = (nodes: Node[]) => nodes.filter((n) => n.props?.clickAction === FUEL_ACTION);

  for (const [label, snap, p, pins] of cases) {
    for (const size of [110, 150, 180, 0])
      it(`${SMALL} builds at ${size} dp with a fuel chip and the forecast line (${label})`, () => {
        const t = build(SMALL, size, snap, p, pins, undefined, size);
        for (const tree of [t.light, t.dark]) {
          const nodes = walk(tree);
          expect(tree.children?.length).toBeGreaterThan(0);
          expect(chipOf(nodes).map((n) => n.props?.clickActionData)).toEqual([{ fuel: nextFuel(p.fuel) }]);
          expect(nodes.some((n) => n.type === 'ListWidget')).toBe(false);
          expect(nodes.some((n) => n.props?.text === t.model.head)).toBe(true);
          if (t.model.sydney) expect(nodes.some((n) => String(n.props?.text ?? '').startsWith(t.model.sydney!.short.slice(0, 5)))).toBe(true);
          // every text is fixed-size so the budget holds
          for (const n of nodes.filter((x) => x.type === 'TextWidget')) expect(n.props?.allowFontScaling).toBe(false);
        }
      });
    for (const [mode] of STATION_MODES)
      for (const height of [0, 60, 80, 110, 150, 164, 180, 220])
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
              // two lines (advice, forecast or note) unless compact; the forecast shows when the data has it
              const texts = walk(items[0]).map((n) => n.props?.text).filter(Boolean);
              const r0 = t.model.rows[0];
              const compact = mediumLayout(height).compact;
              expect(texts).toContain(r0.price);
              // compact one-line rows: the advice alone; two-line rows: advice + distance (Nearest)
              expect(texts).toContain(!compact && r0.dist ? `${r0.advice} · ${r0.dist}` : r0.advice);
              if (compact) expect(texts.some((x) => String(x).includes(' km'))).toBe(false);
              if (!compact && (r0.fc || r0.note)) expect(texts).toContain(r0.fc ?? r0.note);
              // nothing ever repeats the advice on the right
              expect(texts.filter((x) => x === r0.advice)).toHaveLength(r0.dist && !compact ? 0 : 1);
              expect(lists[0].props?.height as number).toBeGreaterThanOrEqual(mediumLayout(height).rowH);
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
            if (snap === full && p.fuel === 'U91' && t.model.rows.length) expect(t.model.rows.every((r) => r.fc)).toBe(true);
            if (label.includes('without forecasts')) expect(t.model.rows.every((r) => r.fc == null)).toBe(true);
            for (const n of nodes.filter((x) => x.type === 'TextWidget' && x.props?.text !== t.model.message)) expect(n.props?.allowFontScaling).toBe(false);
          }
        });
  }
});
