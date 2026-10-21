// Keeps the Android widget in step with the app: mounted once from the root layout. A no-op on web and iOS.
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { onPinsChange } from '@/lib/pins';
import { useSettings } from '@/lib/settings';
import type { Forecast, Stations } from '@/lib/types';

import { setWidgetDataSource } from './data';
import { requestWidgetRefresh } from './render';

export { requestWidgetRefresh };

const isWidgetData = (k: QueryKey) => k[0] === 'forecast' || k[0] === 'stations';

/** Redraws the widget when fresh forecast/stations data arrives, when pins change, and when fuel or area change. */
export function useWidgetSync(client: QueryClient) {
  const s = useSettings();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setWidgetDataSource(() => ({
      forecast: client.getQueryData<Forecast>(['forecast']),
      stations: client.getQueryData<Stations>(['stations']),
    }));
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
  useEffect(() => {
    if (Platform.OS === 'android') requestWidgetRefresh();
  }, [s.fuel, homeKey, s.radiusKm, s.members]);
}
