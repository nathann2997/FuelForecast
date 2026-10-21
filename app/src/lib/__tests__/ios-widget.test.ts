import { describe, expect, it } from '@jest/globals';

import { EMPTY_PROPS, IOS_MAX_ROWS, iosProps, iosTimeline, sydneyMidnight } from '../../widget/ios-model';
import { buildModel, compactForecast, compactStations, type WidgetPrefs, type WidgetSnapshot } from '../../widget/logic';
import { sydneyToday } from '../format';
import type { Forecast, Station, Stations } from '../types';
import fixture from './forecast.fixture.json';

const F = fixture as unknown as Forecast;
const TODAY = '2026-10-21';
const home = { label: 'Parramatta 2150', la: -33.815, lo: 151.003 };
const st = (id: string, n: string, u91: number, age = 0): Station => ({
  id, n, b: 'Brand', s: 'Suburb', pc: 2150, la: -33.815, lo: 151.003, m: 0, p: { U91: [u91, age, 'by', 'Fill by Fri', 'r'] },
});
const STATIONS: Stations = {
  schema: 1, asof: TODAY, suburbs: [],
  stations: Array.from({ length: 12 }, (_, i) => st(String(i + 1), `Station ${i + 1}`, 230 + i)),
};
const snap: WidgetSnapshot = { forecast: compactForecast(F), stations: compactStations(STATIONS), fetchedAt: 0 };
const prefs: WidgetPrefs = { fuel: 'U91', home, radiusKm: 5, members: false };

describe('sydneyMidnight', () => {
  it('is 00:00 Sydney time on both sides of daylight saving', () => {
    expect(sydneyMidnight('2026-10-22').toISOString()).toBe('2026-10-21T13:00:00.000Z');   // AEDT, UTC+11
    expect(sydneyMidnight('2026-07-01').toISOString()).toBe('2026-06-30T14:00:00.000Z');   // AEST, UTC+10
    expect(sydneyMidnight('2026-10-04').toISOString()).toBe('2026-10-03T14:00:00.000Z');   // DST starts at 2 am that day
    expect(sydneyMidnight('2026-04-05').toISOString()).toBe('2026-04-04T13:00:00.000Z');   // DST ends at 3 am that day
  });
});

describe('iosProps', () => {
  it('flattens the model, caps the rows and labels the list', () => {
    const p = iosProps(buildModel(snap, prefs, [], TODAY, IOS_MAX_ROWS));
    expect(p.rows).toHaveLength(IOS_MAX_ROWS);
    expect(p.rows[0]).toMatchObject({ name: expect.any(String), price: '230.0', url: 'fuelforecast://station/1' });
    expect(p.caption).toBe('Cheapest near Parramatta 2150');
    expect(p.best?.url).toBe('fuelforecast://station/1');
    expect(p.tone).toBe('act');
    expect(p.asOf).toBeNull();
  });

  it('says Pinned for pinned stations', () => {
    expect(iosProps(buildModel(snap, prefs, ['3'], TODAY, IOS_MAX_ROWS)).caption).toBe('Pinned');
  });

  it('prompts to open Bowser with no data', () => {
    const p = iosProps(buildModel(null, prefs, [], TODAY, IOS_MAX_ROWS));
    expect(p.head).toBe(EMPTY_PROPS.head);
    expect(p.rows).toEqual([]);
    expect(p.message).toBe('Open Bowser to load prices');
  });
});

describe('iosTimeline', () => {
  it('adds an entry at each of the next Sydney midnights, with day text for that day', () => {
    const now = new Date('2026-10-21T02:00:00Z');   // 1 pm in Sydney
    const t = iosTimeline(snap, prefs, [], now, 2);
    expect(t.map((e) => e.date.toISOString())).toEqual([now.toISOString(), '2026-10-21T13:00:00.000Z', '2026-10-22T13:00:00.000Z']);
    expect(t.map((e) => sydneyToday(e.date))).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    expect(t[0].props.asOf).toBeNull();
    expect(t[1].props.asOf).toMatch(/^as of /);   // the 21 Oct data seen on the 22nd
  });
});
