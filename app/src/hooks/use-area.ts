import { useEffect } from 'react';
import { AppState } from 'react-native';

import { km } from '@/lib/geo';
import { quietLocate } from '@/lib/location';
import { getSettings, setSettings, useSettings } from '@/lib/settings';

/** The remembered area. A GPS area is refreshed quietly on mount and whenever the app comes back to the
 *  foreground (tab screens stay mounted), so it follows the phone. */
export function useArea() {
  const { home } = useSettings();
  const gps = home?.gps === true;
  useEffect(() => {
    if (!gps) return;
    let live = true;
    const refresh = () =>
      quietLocate().then((p) => {
        const cur = getSettings().home;
        if (live && p && cur?.gps && km(cur.la, cur.lo, p.la, p.lo) > 0.2) setSettings({ home: p });
      });
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      live = false;
      sub.remove();
    };
  }, [gps]);
  return home;
}
