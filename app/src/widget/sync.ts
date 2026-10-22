// Keeps the home-screen widget (Android, and iOS via ./render.ios.ts) in step with the app: mounted once from the root
// layout. A no-op on web.
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { syncAlerts } from '@/lib/alerts';
import { onPinsChange } from '@/lib/pins';
import { useSettings } from '@/lib/settings';
import type { Forecast, Stations } from '@/lib/types';

import { setWidgetDataSource } from './data';
import { requestWidgetRefresh } from './render';

export { requestWidgetRefresh };

const isWidgetData = (k: QueryKey) => k[0] === 'forecast' || k[0] === 'stations';

/** Redraws the widget when fresh forecast/stations data arrives, when pins change, and when fuel, area or discounts change.
 *  Also keeps the rise alert (lib/alerts.ts) in step with the forecast, the fuel and the alerts switch. */
export function useWidgetSync(client: QueryClient) {
  const s = useSettings();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const run = () => {
      const f = client.getQueryData<Forecast>(['forecast']);
      if (f) syncAlerts(f.live, f.asof, { inApp: true });
    };
    run();
    return client.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success' && e.query.queryKey[0] === 'forecast') run();
    });
  }, [client, s.fuel, s.alerts]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // updatedAt: when the app got its data (the older file), so the widget can tell the morning's data from a later
    // run's (the pipeline republishes during the day; widget/logic.ts fromAppData). Restored-from-disk data keeps its
    // original time.
    setWidgetDataSource(() => {
      const at = (k: string) => client.getQueryState([k])?.dataUpdatedAt ?? 0;
      return {
        forecast: client.getQueryData<Forecast>(['forecast']),
        stations: client.getQueryData<Stations>(['stations']),
        updatedAt: Math.min(at('forecast'), at('stations')) || undefined,
      };
    });
    const offPins = onPinsChange(() => requestWidgetRefresh());
    const offQueries = client.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'success' && isWidgetData(e.query.queryKey)) requestWidgetRefresh();
    });
    return () => {
      offPins();
      offQueries();
      setWidgetDataSource(null);
    };
  }, [client]);

  const homeKey = s.home ? `${s.home.la},${s.home.lo}` : '';
  const offKey = JSON.stringify(s.discounts);
  useEffect(() => {
    if (Platform.OS !== 'web') requestWidgetRefresh();
  }, [s.fuel, homeKey, s.radiusKm, s.members, offKey]);
}
