// OTA updates apply on the first open (lib/ota.ts): restart into an update that downloads quickly, otherwise carry on.
import { describe, expect, it, jest } from '@jest/globals';

import { applyIfQuick, RESUME_AFTER_MS, resumeWorthChecking } from '../ota';

jest.mock('expo-updates', () => ({ isEnabled: false }));

const api = (o: { available?: boolean; isNew?: boolean; delay?: number; fail?: boolean } = {}) => {
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), o.delay ?? 0));
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(() => (o.fail ? Promise.reject(new Error('offline')) : wait({ isAvailable: o.available ?? true }))),
    fetchUpdateAsync: jest.fn(() => wait({ isNew: o.isNew ?? true })),
    reloadAsync: jest.fn(() => Promise.resolve()),
  } as unknown as Parameters<typeof applyIfQuick>[1] & { reloadAsync: jest.Mock };
};

describe('applying an update at launch', () => {
  it('restarts into a new update that downloads in time', async () => {
    const a = api();
    expect(await applyIfQuick(1000, a, false)).toBe(true);
    expect(a.reloadAsync).toHaveBeenCalledTimes(1);
  });
  it('carries on when there is nothing new, it errors, or it is too slow', async () => {
    for (const a of [api({ available: false }), api({ isNew: false }), api({ fail: true }), api({ delay: 80 })]) {
      expect(await applyIfQuick(50, a, false)).toBe(false);
      expect(a.reloadAsync).not.toHaveBeenCalled();
    }
  });
  it('does nothing in development or where updates are off', async () => {
    const a = api();
    expect(await applyIfQuick(1000, a, true)).toBe(false);
    expect(await applyIfQuick(1000, { ...a, isEnabled: false }, false)).toBe(false);
    expect(a.checkForUpdateAsync).not.toHaveBeenCalled();
  });
});

describe('when things go wrong', () => {
  it('carries on if the restart itself fails', async () => {
    const a = api();
    (a.reloadAsync as jest.Mock).mockImplementation(() => Promise.reject(new Error('ERR_UPDATES_RELOAD')));
    expect(await applyIfQuick(1000, a, false)).toBe(false);
  });
  it('leaves a download that finishes after the wait for the next launch', async () => {
    const a = api({ delay: 30 });   // the check and the download each take 30 ms: 60 ms in all
    expect(await applyIfQuick(45, a, false)).toBe(false);
    expect(a.reloadAsync).not.toHaveBeenCalled();
  });
});

describe('checking on resume', () => {
  it('only after a long time away', () => {
    expect(resumeWorthChecking(null, 1e9)).toBe(false);
    expect(resumeWorthChecking(1e9, 1e9 + RESUME_AFTER_MS - 1)).toBe(false);
    expect(resumeWorthChecking(1e9, 1e9 + RESUME_AFTER_MS)).toBe(true);
  });
});
