import { describe, expect, it } from '@jest/globals';

import { refreshedText, sydneyTime } from '../format';

// Sydney is UTC+11 (AEDT) in late October
const NOW = new Date('2026-10-22T03:00:00Z');   // 2:00 pm Thu 22 Oct in Sydney

describe('sydneyTime', () => {
  it('is h:mm am/pm in Sydney time', () => {
    expect(sydneyTime(new Date('2026-10-21T23:13:00Z'))).toBe('10:13 am');
    expect(sydneyTime(new Date('2026-10-22T10:13:00Z'))).toBe('9:13 pm');
    expect(sydneyTime(new Date('2026-10-22T01:05:00Z'))).toBe('12:05 pm');
    expect(sydneyTime(new Date('2026-07-01T00:30:00Z'))).toBe('10:30 am');   // AEST, UTC+10
  });
});

describe('refreshedText', () => {
  it('gives just the time for today', () => {
    expect(refreshedText('2026-10-21T23:13:05+00:00', NOW)).toBe('Refreshed 10:13 am');
  });
  it('says yesterday for the previous Sydney day, even when it is the same UTC day', () => {
    expect(refreshedText('2026-10-21T10:13:00Z', NOW)).toBe('Refreshed yesterday, 9:13 pm');
  });
  it('names the day for anything older', () => {
    expect(refreshedText('2026-10-19T22:13:00Z', NOW)).toBe('Refreshed Tue 20 Oct, 9:13 am');
  });
  it('treats a time slightly ahead of the phone clock as today', () => {
    expect(refreshedText('2026-10-22T03:05:00Z', NOW)).toBe('Refreshed 2:05 pm');
  });
  it('is empty when there is no usable time (API files from before 0.6.0)', () => {
    expect(refreshedText(undefined, NOW)).toBe('');
    expect(refreshedText('not a date', NOW)).toBe('');
  });
});
