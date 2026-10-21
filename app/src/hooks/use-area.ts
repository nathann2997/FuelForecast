import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { km } from '@/lib/geo';
import { getFixLive, quietLocate, subscribeFixLive } from '@/lib/location';
import { getSettings, setSettings, useSettings } from '@/lib/settings';

/** Mounting or focusing a screen re-reads the position at most this often (tab switches are frequent) */
const REREAD_MS = 60 * 1000;

// One read at a time for the whole app: Today and Stations both use the hook, and both see a foreground event
let pending: Promise<void> | null = null;
let lastRead = 0;

function refresh(): Promise<void> {
  if (pending) return pending;
  lastRead = Date.now();
  pending = quietLocate()
    .then((p) => {
      const cur = getSettings().home;
      if (p && cur?.gps && km(cur.la, cur.lo, p.la, p.lo) > 0.2) setSettings({ home: p });
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
const refreshIfDue = () => (Date.now() - lastRead > REREAD_MS ? refresh() : pending);

/** The remembered area. A GPS area is refreshed quietly when a screen using it mounts or comes into focus (at most once
 *  a minute) and whenever the app comes back to the foreground, so the nearby list follows the phone. Screens only:
 *  useFocusEffect needs a navigator. */
export function useArea() {
  const { home } = useSettings();
  const gps = home?.gps === true;
  useEffect(() => {
    if (!gps) return;
    refreshIfDue();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [gps]);
  useFocusEffect(
    useCallback(() => {
      if (gps) refreshIfDue();
    }, [gps]),
  );
  return home;
}

/** For a GPS area: true once a fix confirmed it this session, false when the phone couldn't locate at all
 *  (permission withdrawn, location off), null before either (lib/location.ts). */
export function useAreaLive(): boolean | null {
  return useSyncExternalStore(subscribeFixLive, getFixLive);
}
