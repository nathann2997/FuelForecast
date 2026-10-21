import { useQuery } from '@tanstack/react-query';

import type { Forecast, History, Meta, StationDetail, Stations } from './types';

// EXPO_PUBLIC_API_BASE points a local build at another copy of the API (e.g. a scratch export served locally)
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'https://nathann2997.github.io/FuelForecast/api/v1';
export const DASHBOARD_URL = 'https://nathann2997.github.io/FuelForecast/';
const SCHEMA = 1;

/** A non-OK HTTP response; `status` lets callers treat a missing file (404) differently from a network error */
export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export const isNotFound = (e: unknown) => e instanceof HttpError && e.status === 404;

async function getJson<T extends { schema: number }>(name: string): Promise<T> {
  const r = await fetch(`${API_BASE}/${name}.json`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new HttpError(`${name}.json: HTTP ${r.status}`, r.status);
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
/** NSW station codes are digits; anything else (a mistyped deep link) is never fetched */
export const isStationId = (id: string | undefined): id is string => !!id && /^\d+$/.test(id);

export const useStationDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ['station', id],
    queryFn: () => getJson<StationDetail>(`station/${id}`),
    enabled: isStationId(id),
    // A 404 means the per-station export failed soft today (stations.json still lists it): don't retry that
    retry: (n, e) => !isNotFound(e) && n < 2,
    ...opts,
    // Long enough to reopen a recently visited station offline, short enough that the persisted cache
    // doesn't keep every station ever opened
    gcTime: 6 * 60 * 60 * 1000,
  });
