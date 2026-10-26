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

/** Google's zoom level for a region shown `widthDp` wide (0 = the whole world on one 256 dp tile), for clustering */
export const zoomOf = (r: Region, widthDp: number) =>
  Math.max(0, Math.min(21, Math.log2((360 * widthDp) / (256 * Math.max(r.longitudeDelta, 1e-9)))));

/** The longitude span that zoom `z` shows across `widthDp` */
export const lonSpanAt = (z: number, widthDp: number) => (360 * widthDp) / (256 * 2 ** z);

/** [west, south, east, north] of a region */
export const bboxOf = (r: Region): [number, number, number, number] => [
  r.longitude - r.longitudeDelta / 2, r.latitude - r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2, r.latitude + r.latitudeDelta / 2,
];

/** A box grown by `f` of its size on each side, and by `bottom` more at the bottom: tags hang above their point, so one
 *  just below the screen still shows */
export function padBox([w, so, e, n]: [number, number, number, number], f: number, bottom = 0): [number, number, number, number] {
  const dx = (e - w) * f;
  const dy = n - so;
  return [w - dx, so - dy * (f + bottom), e + dx, n + dy * f];
}

/** Whether a point is inside a [west, south, east, north] box */
export const inBox = ([w, so, e, n]: [number, number, number, number], la: number, lo: number) => lo >= w && lo <= e && la >= so && la <= n;

/**
 * Whether the area really changed from `a` to `b`: another suburb, GPS versus a suburb, or a GPS fix that moved more
 * than a quarter of the radius (at least 1 km). The map re-centres on such a change; a GPS re-read a few hundred metres
 * on (useArea refreshes on every focus) doesn't pull it back.
 */
export function areaMoved(a: Place | null, b: Place | null, radiusKm: number) {
  if (!a || !b) return a !== b;
  if (!!a.gps !== !!b.gps || (!a.gps && a.label !== b.label)) return true;
  return km(a.la, a.lo, b.la, b.lo) > Math.max(1, radiusKm / 4);
}

/** Every station the map can show for `fuel` (members and discount rules as the list, no radius: the map shows what's
 *  in view), with distances from `home`. */
export function mapStations(
  stations: Station[],
  fuel: Fuel,
  opts: { home: Place | null; members: boolean; discounts?: Discounts },
): StationRow[] {
  const h = opts.home;
  return rankStations(stations, fuel, { home: null, radiusKm: 0, members: opts.members, discounts: opts.discounts }).map((r) => ({
    ...r, d: h ? km(h.la, h.lo, r.la, r.lo) : null,
  }));
}

/** Pin colour: the cheapest third of the stations in view, the middle third, the dearest third */
export type Tier = 'low' | 'mid' | 'high';

/**
 * Splits the prices (what you pay) of the stations in view into thirds, and returns the colour for any price. Ties stay together, so a price never gets two
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
