// Apply over-the-air updates on the first open, not the second. By default expo-updates downloads a new update in the
// background at launch and only runs it on the next cold start, and Android often keeps the app in memory, so people
// kept seeing the old version (2026-10-24). Now, while the splash screen is up, the app checks for an update for up to
// LAUNCH_WAIT_MS and restarts into it if one downloads; and on coming back after RESUME_AFTER_MS away (which feels like a
// fresh open anyway) it does the same within RESUME_WAIT_MS. Anything slower is kept for the next launch, as before.
import * as Updates from 'expo-updates';

export const LAUNCH_WAIT_MS = 2500;   // the splash waits this long at most for a launch with no update
export const RESUME_AFTER_MS = 30 * 60 * 1000;
export const RESUME_WAIT_MS = 3000;   // short, so a restart can't land while you're already tapping

type Api = Pick<typeof Updates, 'checkForUpdateAsync' | 'fetchUpdateAsync' | 'reloadAsync'> & { isEnabled: boolean };

/** Check, download and restart into a new update if all of that finishes within `waitMs`. Resolves false when there's
 *  nothing new, updates are off (dev, web), or it took too long or failed: the app carries on as it is. */
export async function applyIfQuick(waitMs: number, api: Api = Updates, dev = __DEV__): Promise<boolean> {
  if (dev || !api.isEnabled) return false;
  let timedOut = false;
  const timer = new Promise<'timeout'>((r) => setTimeout(() => { timedOut = true; r('timeout'); }, waitMs));
  const work = (async () => {
    const check = await api.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const got = await api.fetchUpdateAsync();
    return got.isNew;
  })().catch(() => false);
  const res = await Promise.race([work, timer]);
  if (res !== true || timedOut) return false;   // a download that finishes later still runs on the next launch
  try {
    await api.reloadAsync();
  } catch {
    return false;   // e.g. ERR_UPDATES_RELOAD: the downloaded update runs on the next launch instead
  }
  return true;
}

/** Whether coming back to the app should check for an update: away long enough that a restart won't interrupt anything */
export const resumeWorthChecking = (backgroundedAt: number | null, now: number) =>
  backgroundedAt != null && now - backgroundedAt >= RESUME_AFTER_MS;

// The launch check starts as soon as the app's JS loads, in parallel with restoring the cached data
let launch: Promise<boolean> | null = null;
let resume: Promise<boolean> = Promise.resolve(false);
/** The check when the app comes back after a long time away (true: restarting into an update) */
export function resumeCheck(waitMs: number): Promise<boolean> {
  resume = applyIfQuick(waitMs);
  return resume;
}
/** The latest resume check, for analytics to wait on (lib/analytics.ts logOpen) */
export const lastResumeCheck = () => resume;

export function launchCheck(): Promise<boolean> {
  launch ??= applyIfQuick(LAUNCH_WAIT_MS);
  return launch;
}
