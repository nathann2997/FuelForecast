import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { requestWidgetRefresh } from '@/widget/sync';

import type { Place } from './geo';

/** Device position, or an Error with a message fit to show */
export async function locate(): Promise<Place> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Bowser doesn’t have permission to use your location. Type a suburb or postcode instead.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
  const pos =
    last ??
    (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => {
        throw new Error('Couldn’t find your location. Check location is on, or type a suburb.');
      }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('Couldn’t find your location in time. Try again, or type a suburb.')), 15000)),
    ]));
  noteFix();
  return { label: 'your location', la: pos.coords.latitude, lo: pos.coords.longitude, gps: true };
}

/** A fresh fix without prompting, when permission was already given; null otherwise. A last-known position is reused
 *  only if under 2 min old, so "nearby" follows a moving phone. */
export async function quietLocate(): Promise<Place | null> {
  const started = fixSeq;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' || !(await Location.hasServicesEnabledAsync())) {
      noteNoLocation(started);
      return null;
    }
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 })) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((ok) => setTimeout(() => ok(null), 10000)),
      ]));
    if (!pos) return null;   // no fix in time (indoors, say): not a reason to call the area stale
    noteFix();
    return { label: 'your location', la: pos.coords.latitude, lo: pos.coords.longitude, gps: true };
  } catch {
    return null;
  }
}

// ---- Is the GPS area live? Stations says "Near you in Parramatta" while it is, and "Parramatta (last known)" once
// the phone can't locate at all (permission withdrawn, location off). null until either happens this session.
let fixLive: boolean | null = null;
let fixSeq = 0;   // counts fixes, so a read can tell whether one landed while it ran
const fixListeners = new Set<() => void>();
function setFixLive(v: boolean) {
  if (v === fixLive) return;
  fixLive = v;
  fixListeners.forEach((l) => l());
}
function noteFix() {
  fixSeq += 1;
  setFixLive(true);
}
/** A read that started at fix count `started` found location unavailable; a fix since (e.g. "Use my location") wins */
function noteNoLocation(started: number) {
  if (fixSeq === started) setFixLive(false);
}
export const getFixLive = () => fixLive;
export function subscribeFixLive(l: () => void) {
  fixListeners.add(l);
  return () => {
    fixListeners.delete(l);
  };
}

// ---- Background location, for the Android home-screen widget ("Allow all the time"). Android only for now.
export type BgLocation = {
  status: 'granted' | 'denied' | 'undetermined' | 'unsupported';
  canAskAgain: boolean;
  servicesOff?: boolean;     // location is switched off for the whole phone
};

const UNSUPPORTED: BgLocation = { status: 'unsupported', canAskAgain: false };
const bgSupported = () => Platform.OS === 'android';
const asBg = (r: { status: string; canAskAgain: boolean }): BgLocation => ({
  status: r.status === 'granted' ? 'granted' : r.status === 'denied' ? 'denied' : 'undetermined',
  canAskAgain: r.canAskAgain,
});

/** Android 11+ (API 30) sends the background request to the system Settings page instead of a dialog */
export const bgRequestOpensSettings = () => Platform.OS === 'android' && Number(Platform.Version) >= 30;

/** Whether the widget may read the position while Bowser is closed. Background needs foreground too. */
export async function backgroundLocationStatus(): Promise<BgLocation> {
  if (!bgSupported()) return UNSUPPORTED;
  try {
    const servicesOff = !(await Location.hasServicesEnabledAsync());
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return { status: fg.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: fg.canAskAgain, servicesOff };
    return { ...asBg(await Location.getBackgroundPermissionsAsync()), servicesOff };
  } catch {
    return UNSUPPORTED;
  }
}

/** Ask for "Allow all the time": foreground first if needed, then background. On Android 11+ the background request
 *  opens the system settings page, so the result may still be "denied" here; callers re-check when the app becomes
 *  active again (useBackgroundLocation does). When Android won't show a prompt any more, open the app's settings. */
export async function requestBackgroundLocation(): Promise<BgLocation> {
  if (!bgSupported()) return UNSUPPORTED;
  try {
    let fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      if (!fg.canAskAgain) {
        await Linking.openSettings();
        return backgroundLocationStatus();
      }
      fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') return backgroundLocationStatus();
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      if (bg.canAskAgain) await Location.requestBackgroundPermissionsAsync();
      else await Linking.openSettings();
    }
  } catch (e) {
    // Only send the user to Settings when Android won't prompt any more; otherwise just report it
    console.warn('requestBackgroundLocation failed', e);
    const now = await backgroundLocationStatus();
    if (now.status !== 'granted' && now.status !== 'unsupported' && !now.canAskAgain) await Linking.openSettings().catch(() => {});
    return now;
  }
  return backgroundLocationStatus();
}

/** Opens the phone's Location settings (location services switched off), or the app's settings as a fallback */
export async function openLocationSettings() {
  try {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}

/** Background location status that refreshes whenever Bowser comes back to the foreground (e.g. from Settings).
 *  When the widget gains or loses permission, it is asked to redraw so the live list appears straight away. */
export function useBackgroundLocation() {
  const [st, setSt] = useState<BgLocation | null>(bgSupported() ? null : UNSUPPORTED);
  const refresh = useCallback(() => {
    backgroundLocationStatus().then(setSt);
  }, []);
  useEffect(() => {
    if (!bgSupported()) return;
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  const request = useCallback(async () => {
    setSt(await requestBackgroundLocation());
  }, []);
  // Widget redraw on a change to or from "granted" (not on the first read)
  const live = st && st.status !== 'unsupported' ? st.status === 'granted' && !st.servicesOff : null;
  const prev = useRef<boolean | null>(null);
  useEffect(() => {
    if (live == null) return;
    if (prev.current != null && prev.current !== live) requestWidgetRefresh();
    prev.current = live;
  }, [live]);
  return { status: st, request, refresh };
}
