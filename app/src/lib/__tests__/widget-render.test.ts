// The widget library builds widgets by calling our components as plain functions, outside React. If the React
// Compiler rewrites them they call a hook there and the widget renders blank (shipped in 0.3.0). Guard both halves.
import { describe, expect, it, jest } from '@jest/globals';
import { transformFileSync } from '@babel/core';

import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';

import { buildModel, type WidgetPrefs } from '../../widget/logic';
import { MEDIUM, SMALL, renderWidgetFor } from '../../widget/widgets';
import type { Forecast, Stations } from '../types';
import fixture from './forecast.fixture.json';

jest.mock('react-native-android-widget/src/NativeAndroidWidget', () => ({ __esModule: true, default: {} }));

describe('widget rendering', () => {
  it('widgets.tsx is not rewritten by the React Compiler', () => {
    const file = 'src/widget/widgets.tsx';   // jest runs from app/
    const out = transformFileSync(file, {
      filename: file, babelrc: false, configFile: false,
      presets: [['babel-preset-expo', { 'react-compiler': {} }]],
      caller: { name: 'metro', platform: 'android', bundler: 'metro', supportsReactCompiler: true, isDev: false } as never,
    })?.code ?? '';
    expect(out).not.toMatch(/compiler-runtime|useMemoCache/);
  });

  const prefs: WidgetPrefs = { fuel: 'U91', home: null, radiusKm: 5, members: true };
  const stations: Stations = { schema: 1, asof: (fixture as Forecast).asof, stations: [], suburbs: [] };
  const snaps = [null, { forecast: fixture as unknown as Forecast, stations, fetchedAt: 0 }];

  for (const name of [SMALL, MEDIUM])
    for (const snap of snaps)
      it(`${name} builds a tree outside React (${snap ? 'with data' : 'no data'})`, () => {
        const model = buildModel(snap as never, prefs, [], (fixture as Forecast).asof);
        const rep = renderWidgetFor(name, { height: 180 }, model) as { light: never; dark: never };
        expect(buildWidgetTree(rep.light).children?.length).toBeGreaterThan(0);
        expect(buildWidgetTree(rep.dark).children?.length).toBeGreaterThan(0);
      });
});
