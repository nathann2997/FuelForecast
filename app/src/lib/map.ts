// The Stations map (components/station-map.tsx): which stations it shows, how their pins are coloured, and the region
// maths. Pure functions, no React or map library, so they can be tested.
import type { Discounts } from './discounts';
import { km, rankStations, type Place, type StationRow } from './geo';
import type { Fuel, Station } from './types';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

/** Sydney CBD, for a map with no area set */
export const SYDNEY: Place = { label: 'Sydney', la: -33.8688, lo: 151.2093 };

const KM_PER_DEG = 111.32;

/** A region that shows a circle of `radiusKm` around a point, with a little margin */
export function regionFor(p: Place, radiusKm: number): Region {
  const latitudeDelta = ((2 * radiusKm) / KM_PER_DEG) * 1.2;
  return { latitude: p.la, longitude: p.lo, latitudeDelta, longitudeDelta: latitudeDelta / Math.cos((p.la * Math.PI) / 180) };
}

/** Google's zoom level for a region (0 = the whole world), for clustering */
export const zoomOf = (r: Region) => Math.max(0, Math.min(20, Math.log2(360 / Math.max(r.longitudeDelta, 1e-6))));

/** [west, south, east, north] of a region */
export const bboxOf = (r: Region): [number, number, number, number] => [
  r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2,
];

/** Offer "Search this area" once the map's centre has moved a quarter of the radius (at least 1 km) from the area searched */
export const offerSearch = (centre: Place, r: Region, radiusKm: number) =>
  km(centre.la, centre.lo, r.latitude, r.longitude) > Math.max(1, radiusKm / 4);

/**
 * Whether the area really changed from `a` to `b`: another suburb, GPS versus a suburb, or a GPS fix that moved more
 * than a quarter of the radius (at least 1 km). The map follows such a change and drops a search made from the old
 * area; a GPS re-read a few hundred metres on (useArea refreshes on every focus) does neither.
 */
export function areaMoved(a: Place | null, b: Place | null, radiusKm: number) {
  if (!a || !b) return a !== b;
  if (!!a.gps !== !!b.gps || (!a.gps && a.label !== b.label)) return true;
  return km(a.la, a.lo, b.la, b.lo) > Math.max(1, radiusKm / 4);
}

/**
 * The stations the map shows: the same radius, members and discount rules as the list, but around `centre` (where the
 * map last searched, or the area). Distances stay from `home`, where the driver is, not from the searched spot.
 * No centre and no home: every station.
 */
export function areaRows(
  stations: Station[],
  fuel: Fuel,
  opts: { centre: Place | null; home: Place | null; radiusKm: number; members: boolean; discounts?: Discounts },
): StationRow[] {
  const rows = rankStations(stations, fuel, { home: opts.centre, radiusKm: opts.radiusKm, members: opts.members, discounts: opts.discounts });
  if (opts.centre === opts.home) return rows;
  const h = opts.home;
  return rows.map((r) => ({ ...r, d: h ? km(h.la, h.lo, r.la, r.lo) : null }));
}

/** Pin colour: the cheapest third of the stations on the map, the middle third, the dearest third */
export type Tier = 'low' | 'mid' | 'high';

/**
 * Splits the prices (what you pay) of the stations in the area into thirds, and returns the colour for any price: so a
 * pinned station outside the area is coloured against the area too. Ties stay together, so a price never gets two
 * colours. When the spread is under 1c, or there are fewer than 3 stations, everything is 'mid': colours would claim
 * differences that aren't there.
 */
export function priceTiers(prices: number[]): (price: number) => Tier {
  const s = [...prices].sort((a, b) => a - b);
  const n = s.length;
  if (n < 3 || s[n - 1] - s[0] < 1) return () => 'mid';
  const lo = s[Math.floor((n - 1) / 3)];
  const hi = s[Math.ceil((2 * (n - 1)) / 3)];
  return (p) => (p <= lo ? 'low' : p >= hi && hi > lo ? 'high' : 'mid');
}

/** A short brand label for a price tag ("7-Eleven", "Ampol"); long names are cut */
export function brandLabel(b: string, max = 10) {
  const t = b.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
