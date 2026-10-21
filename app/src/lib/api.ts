import { useQuery } from '@tanstack/react-query';

import type { Forecast, History, Meta, Stations } from './types';

export const API_BASE = 'https://nathann2997.github.io/FuelForecast/api/v1';
export const DASHBOARD_URL = 'https://nathann2997.github.io/FuelForecast/';
const SCHEMA = 1;

async function getJson<T extends { schema: number }>(name: string): Promise<T> {
  const r = await fetch(`${API_BASE}/${name}.json`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${name}.json: HTTP ${r.status}`);
  const j = (await r.json()) as T;
  if (j.schema !== SCHEMA) throw new Error(`${name}.json: schema ${j.schema}, app expects ${SCHEMA}. Update the app.`);
  return j;
}

// Data changes once a day; the CDN caches for 10 minutes. Refetch on focus at most every 15 minutes.
const opts = { staleTime: 15 * 60 * 1000 };

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => getJson<Meta>('meta'), ...opts });
export const useForecast = () => useQuery({ queryKey: ['forecast'], queryFn: () => getJson<Forecast>('forecast'), ...opts });
export const useStations = () => useQuery({ queryKey: ['stations'], queryFn: () => getJson<Stations>('stations'), ...opts });
export const useHistory = () => useQuery({ queryKey: ['history'], queryFn: () => getJson<History>('history'), ...opts });
