// The update notice only shows for a newer, well-formed release with an EAS link.
import { describe, expect, it } from '@jest/globals';

import { newer, pendingRelease } from '@/components/update-notice';

const URL = 'https://expo.dev/accounts/nathann97/projects/fuel-forecast/builds/9e1d7d49-b7ba-470c-bb1d-350d1d90d33e';

describe('newer', () => {
  it('compares each part as a number', () => {
    expect(newer('0.10.0', '0.9.9')).toBe(true);
    expect(newer('0.7.0', '0.7.0')).toBe(false);
    expect(newer('0.6.1', '0.7.0')).toBe(false);
    expect(newer('1.0.0', '0.99.99')).toBe(true);
  });
});

describe('pendingRelease', () => {
  const app = { schema: 1, android: { version: '0.7.0', url: URL, notes: 'Usage and crash reports.' }, ios: null };

  it('returns a newer release for this platform', () => {
    expect(pendingRelease(app, 'android', '0.6.1')).toEqual({ version: '0.7.0', url: URL, notes: 'Usage and crash reports.' });
    expect(pendingRelease(app, 'android', '0.1.0')?.version).toBe('0.7.0');
  });

  it('is null when up to date, ahead, or on another platform', () => {
    expect(pendingRelease(app, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease(app, 'android', '0.8.0')).toBeNull();
    expect(pendingRelease(app, 'ios', '0.1.0')).toBeNull();
    expect(pendingRelease(app, 'web', '0.1.0')).toBeNull();
  });

  it('ignores bad versions, non-EAS links and junk', () => {
    expect(pendingRelease({ android: { version: '0.8', url: URL } }, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease({ android: { version: '0.8.0', url: 'https://evil.example/app.apk' } }, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease({ android: { version: '0.8.0', url: 'http://expo.dev/x' } }, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease({ android: { version: '0.8.0', url: 'https://expo.dev/accounts/someone/projects/x/builds/9e1d7d49-b7ba-470c-bb1d-350d1d90d33e' } }, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease({ android: { version: '0.8.0', url: URL } }, 'android', undefined)).toBeNull();
    expect(pendingRelease(null, 'android', '0.7.0')).toBeNull();
    expect(pendingRelease('nope', 'android', '0.7.0')).toBeNull();
  });

  it('drops over-long notes', () => {
    expect(pendingRelease({ android: { version: '0.8.0', url: URL, notes: 'x'.repeat(301) } }, 'android', '0.7.0')?.notes).toBeUndefined();
  });
});
