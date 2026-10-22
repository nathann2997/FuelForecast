import { describe, expect, it } from '@jest/globals';

import type { SavingsSummary } from '../savings';
import { dealMessage, savingsMessage, SHARE_BASE, shareUrl } from '../share';

const sum = (total: number, n = 3): SavingsSummary => ({ n, litres: 140, since: '2026-10-01', total, where: total, when: 0, pending: 0 });

describe('share', () => {
  it('links to the share page beside the API', () => {
    expect(SHARE_BASE).toBe('https://nathann2997.github.io/FuelForecast/s/');
    expect(shareUrl('231', 'U91')).toBe('https://nathann2997.github.io/FuelForecast/s/?id=231&f=U91');
  });
  it('shares the pump price, the gap and the advice', () => {
    const m = dealMessage({ id: '231', n: '7-ELEVEN GRANVILLE EAST', s: 'Granville East', fuel: 'U91', pump: 235.9, median: 237.7, advice: 'Fill by Sun 25 Oct' });
    expect(m).toBe('7-Eleven Granville East (Granville East): Unleaded 91 235.9c/L today, 1.8c under the Sydney median. Bowser says: Fill by Sun 25 Oct.\nhttps://nathann2997.github.io/FuelForecast/s/?id=231&f=U91');
    expect(dealMessage({ id: '1', n: 'X', s: 'Y', fuel: 'DL', pump: 280, median: null, advice: null })).toBe('X (Y): Diesel 280.0c/L today.\nhttps://nathann2997.github.io/FuelForecast/s/?id=1&f=DL');
  });
  it('only brags about a real saving', () => {
    expect(savingsMessage(sum(23.4))).toMatch(/^Bowser has saved me \$23\.40 on fuel since 1 Oct \(3 fills\)\./);
    expect(savingsMessage(sum(0.004))).toBeNull();
    expect(savingsMessage(sum(-2))).toBeNull();
  });
});
