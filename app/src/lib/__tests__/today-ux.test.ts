// Today and the lists after the 2026-10-23 design review: advice chips that only repeat the headline are left out, and
// the forecast tiles use labels that fit a quarter of a phone.
import { describe, expect, it } from '@jest/globals';

import { echoesSydney, horizons } from '../copy';
import { forecastTiles } from '../station';
import type { LiveRow, StationForecast } from '../types';

describe('advice chips', () => {
  it('drops a chip that repeats a Wait or No rush headline', () => {
    expect(echoesSydney('wait', 'wait')).toBe(true);
    expect(echoesSydney('any', 'calm')).toBe(true);
  });
  it('keeps chips that add something', () => {
    expect(echoesSydney('by', 'act')).toBe(false);     // a date to fill by
    expect(echoesSydney('now', 'act')).toBe(false);
    expect(echoesSydney('any', 'wait')).toBe(false);   // differs from the headline
    expect(echoesSydney('chk', 'calm')).toBe(false);   // a stale price is always flagged
    expect(echoesSydney('hi', 'wait')).toBe(false);    // "Skip for now": this station is dear right now
    expect(echoesSydney('wait', undefined)).toBe(false);
  });
});

describe('forecast tile labels', () => {
  const r = { now: 237, d1: 1, lo1: 0, hi1: 2, d3: 1, lo3: 0, hi3: 2, d7: 1, lo7: 0, hi7: 2, d14: 1, lo14: 0, hi14: 2 } as unknown as LiveRow;
  it('are short on Today and on the station page', () => {
    expect(horizons(r).map((h) => h.short)).toEqual(['1 day', '3 days', '7 days', '14 days']);
    expect(forecastTiles({ ...r, rise: null, adv: ['ok', '', ''] } as unknown as StationForecast, '2026-10-23').map((t) => t.label))
      .toEqual(['1 day', '3 days', '7 days', '14 days']);
  });
});
