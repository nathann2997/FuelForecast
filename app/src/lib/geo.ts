import type { Fuel, Station, StationPrice, Suburb } from './types';

/** Great-circle distance in km */
export function km(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const x =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

export type Place = { label: string; la: number; lo: number; gps?: boolean };

/** Suburb or postcode search, same matching as the dashboard: exact name, then prefix, then substring. */
export function findSuburb(suburbs: Suburb[], query: string): Place | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const m = q.match(/(\d{4})/);
  const name = q.replace(/\d{4}/, '').trim();
  const pcOk = (x: Suburb) => !m || String(x.pc) === m[1];
  let hits = suburbs.filter((x) => pcOk(x) && (!name || x.s.toLowerCase() === name));
  if (!hits.length) hits = suburbs.filter((x) => pcOk(x) && (!name || x.s.toLowerCase().startsWith(name)));
  if (!hits.length && name) hits = suburbs.filter((x) => x.s.toLowerCase().includes(name));
  if (!hits.length) return null;
  const la = hits.reduce((a, h) => a + h.la, 0) / hits.length;
  const lo = hits.reduce((a, h) => a + h.lo, 0) / hits.length;
  const label =
    hits.length === 1
      ? `${hits[0].s} ${hits[0].pc}`
      : [...new Set(hits.map((h) => h.s))].slice(0, 3).join(', ');
  return { label, la, lo };
}

/** The suburb whose centre (the mean of its stations) is nearest a point, if within `maxKm`: a GPS fix's place name,
 *  from the stations file's suburb list (offline, the same names the area search uses). Names with digits are skipped:
 *  the list has a few unparsed addresses and "Postcode 2153" placeholders. */
export function nearestSuburb(suburbs: Suburb[], la: number, lo: number, maxKm = 3): Suburb | null {
  let best: Suburb | null = null;
  let bestD = maxKm;
  for (const x of suburbs) {
    if (/\d/.test(x.s)) continue;
    const d = km(la, lo, x.la, x.lo);
    if (d <= bestD) {
      best = x;
      bestD = d;
    }
  }
  return best;
}

/**
 * How the area reads in a "Near …" line. A typed suburb is its label. A GPS area names the suburb you're in: "you in
 * Parramatta" while live (a fix this session, or none yet), and once the phone can't locate (`live` false) just
 * "Parramatta" with `lastKnown`, so the list isn't passed off as live. Away from every suburb: "you".
 */
export function areaName(home: Place, suburbs: Suburb[], live: boolean | null): { text: string; lastKnown: boolean } {
  if (!home.gps) return { text: home.label, lastKnown: false };
  const sub = nearestSuburb(suburbs, home.la, home.lo)?.s;
  if (live === false) return { text: sub ?? 'your last location', lastKnown: true };
  return { text: sub ? `you in ${sub}` : 'you', lastKnown: false };
}

export type StationRow = Station & { price: number; age: number | null; adv: StationPrice; d: number | null };

/** Stations selling `fuel`, filtered by radius from `home` (if any); cheapest first (dashboard order) or nearest first. */
export function rankStations(
  stations: Station[],
  fuel: Fuel,
  opts: { home: Place | null; radiusKm: number; members: boolean; sort?: 'price' | 'distance' },
): StationRow[] {
  const rows: StationRow[] = [];
  for (const s of stations) {
    const p = s.p[fuel];
    if (!p || p[0] == null || (!opts.members && s.m)) continue;
    const d = opts.home ? km(opts.home.la, opts.home.lo, s.la, s.lo) : null;
    if (d != null && d > opts.radiusKm) continue;
    rows.push({ ...s, price: p[0], age: p[1], adv: p, d });
  }
  if (opts.sort === 'distance' && opts.home) return rows.sort((a, b) => a.d! - b.d! || a.price - b.price);
  return rows.sort((a, b) => a.price - b.price || (a.d ?? 0) - (b.d ?? 0));
}
