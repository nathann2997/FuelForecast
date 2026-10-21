// The widget's own location: read without prompting (the widget never asks for permission; the app does that in More),
// and only with background ("Allow all the time") permission, since the widget runs while the app is closed.
// No foreground service and no continuous updates: a last-known read on redraws, a one-off fix on a ⟳ tap.
import * as Location from 'expo-location';

import { clearFix, readFix, readPrefs, saveFix } from './data';
import type { WidgetFix } from './logic';

// 30 min old at most, no GPS wake-up. 3 km, not 1 km: with "approximate" location Android only gives fixes of about
// 2 km or worse, and a tighter limit would mean such users never get a periodic fix.
export const LAST_KNOWN = { maxAge: 30 * 60 * 1000, requiredAccuracy: 3000 };
export const LOCATE_TIMEOUT_MS = 8000;

export async function backgroundGranted(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** `at` is when the position was measured (its own timestamp, never in the future), not when we read it: a 30-min-old
 *  last-known position must not count as live for the full 6 h. */
export const toFix = (p: Location.LocationObject | null, now: number): WidgetFix | null =>
  p
    ? { la: p.coords.latitude, lo: p.coords.longitude, at: Number.isFinite(p.timestamp) && p.timestamp > 0 ? Math.min(p.timestamp, now) : now }
    : null;

async function lastKnown(now: number): Promise<WidgetFix | null> {
  try {
    return toFix(await Location.getLastKnownPositionAsync(LAST_KNOWN), now);
  } catch {
    return null;
  }
}

/** A fresh fix (Balanced accuracy, at most 8 s), else the last known one; null if neither. */
async function currentFix(now: number, timeoutMs: number): Promise<WidgetFix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
      new Promise<null>((ok) => { timer = setTimeout(() => ok(null), timeoutMs); }),
    ]);
    if (pos) return toFix(pos, now);
  } catch {
    // location off, or no fix: fall back below
  } finally {
    clearTimeout(timer);
  }
  return lastKnown(now);
}

/**
 * Update the stored widget fix when the widget may use location (`canLocate`: background permission and a GPS or
 * unset area). `fresh` (a ⟳ tap) asks for a current fix; otherwise only the last known one is read. Returns the
 * stored fix (new or previous). When the widget may not use location, the stored fix is deleted.
 */
export async function updateFix(canLocate: boolean, fresh: boolean, now = Date.now(), timeoutMs = LOCATE_TIMEOUT_MS): Promise<WidgetFix | null> {
  if (!canLocate) {
    await clearFix();
    return null;
  }
  const fix = fresh ? await currentFix(now, timeoutMs) : await lastKnown(now);
  if (fix) await saveFix(fix);
  return fix ?? readFix();
}

/**
 * Before a redraw: is background location granted, and (when the widget may use it) refresh the stored fix.
 * `fresh` for a ⟳ tap; `skip` for redraws that shouldn't touch location at all (resize, mode and fuel taps).
 */
export async function prepareLocation(opts: { fresh?: boolean; skip?: boolean } = {}): Promise<{ bgGranted: boolean }> {
  const bgGranted = await backgroundGranted();
  const home = readPrefs().home;
  const canLocate = bgGranted && !(home && !home.gps);
  if (!canLocate) await clearFix();   // even on skip: a withdrawn permission or typed suburb drops the coordinates
  else if (!opts.skip) await updateFix(true, !!opts.fresh);
  return { bgGranted };
}
