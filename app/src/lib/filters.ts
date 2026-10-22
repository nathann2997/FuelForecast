// Station list filters (the Filters sheet on the Stations tab) and the pinned group. Pure functions, no React.
import type { Discounts } from './discounts';
import { km, stationRow, type Place, type StationRow } from './geo';
import type { AdviceCode, Fuel, Station } from './types';

export const RADII = [2, 5, 10, 20] as const;
export const STALE_DAYS = 7;

/** "When to fill" groups in the sheet; each maps to one or more advice codes from stations.json. */
export type AdviceGroup = 'now' | 'by' | 'wait' | 'calm' | 'chk';
export const ADVICE_GROUPS: readonly (readonly [AdviceGroup, string, readonly AdviceCode[]])[] = [
  ['now', 'Fill now', ['now']],
  ['by', 'Fill by…', ['by']],
  ['wait', 'Wait', ['wait', 'hi']],
  ['calm', 'No rush or Any time', ['ok', 'any']],
  ['chk', 'Check price', ['chk']],
];

export type FilterSettings = {
  sort: 'price' | 'distance';
  radiusKm: number;
  members: boolean;          // include members-only sites
  showStale: boolean;        // include prices not updated for over STALE_DAYS
  brands: string[];          // empty = all brands
  advice: AdviceGroup[];     // empty = any advice
  maxPrice: number | null;   // c/L, null = no limit
  pinnedOnly: boolean;
};

export const FILTER_DEFAULTS: FilterSettings = {
  sort: 'price', radiusKm: 5, members: true, showStale: false, brands: [], advice: [], maxPrice: null, pinnedOnly: false,
};

/** Number of filters that narrow (or widen) the list compared with the defaults. Sort and radius are not counted:
 *  sort only reorders, and the radius always has a value and is shown in the area bar. */
export function filterCount(f: FilterSettings) {
  return (
    (f.brands.length ? 1 : 0) +
    (f.advice.length ? 1 : 0) +
    (f.maxPrice != null ? 1 : 0) +
    (f.members ? 0 : 1) +
    (f.showStale ? 1 : 0) +
    (f.pinnedOnly ? 1 : 0)
  );
}

/** True if anything (sort and radius included) differs from the defaults, i.e. Reset would change something. */
export function isFiltered(f: FilterSettings) {
  return filterCount(f) > 0 || f.sort !== FILTER_DEFAULTS.sort || f.radiusKm !== FILTER_DEFAULTS.radiusKm;
}

export const isStale = (age: number | null) => age != null && age > STALE_DAYS;

/** Brands of the stations selling `fuel` today, most stations first, then by name. */
export function brandCounts(stations: Station[], fuel: Fuel): { brand: string; n: number }[] {
  const m = new Map<string, number>();
  for (const s of stations) if (s.p[fuel]) m.set(s.b, (m.get(s.b) ?? 0) + 1);
  return [...m.entries()].map(([brand, n]) => ({ brand, n })).sort((a, b) => b.n - a.n || a.brand.localeCompare(b.brand));
}

/** Brand chips to show in the sheet. Selected brands always appear (even with no stations for this fuel, so they
 *  can be cleared). Without a search, only the top `limit` unless `all`; a search matches anywhere in the name. */
export function brandOptions(
  brands: { brand: string; n: number }[], selected: string[], query: string, all: boolean, limit = 12,
): { brand: string; n: number }[] {
  const known = new Set(brands.map((b) => b.brand));
  const list = [...brands, ...selected.filter((b) => !known.has(b)).map((brand) => ({ brand, n: 0 }))];
  const sel = new Set(selected);
  const q = query.trim().toLowerCase();
  if (q) return list.filter((b) => sel.has(b.brand) || b.brand.toLowerCase().includes(q));
  if (all || brands.length <= limit) return list;
  return list.filter((b, i) => i < limit || sel.has(b.brand));
}

/** Rows (already ranked by radius / members / sort) narrowed by brand, advice, max price (the price you pay) and freshness. */
export function applyFilters(rows: StationRow[], f: FilterSettings): StationRow[] {
  const codes = new Set<AdviceCode>(ADVICE_GROUPS.filter(([g]) => f.advice.includes(g)).flatMap(([, , c]) => c));
  const brands = new Set(f.brands);
  return rows.filter(
    (r) =>
      (f.showStale || !isStale(r.age)) &&
      (!brands.size || brands.has(r.b)) &&
      (!codes.size || codes.has(r.adv[2])) &&
      (f.maxPrice == null || r.price <= f.maxPrice),
  );
}

/** A pinned station: a priced row for the fuel, or a placeholder when today's data has no price for it. */
export type PinnedItem = { id: string; row: StationRow; station: Station } | { id: string; row: null; station: Station | null };

/** Pinned stations in pin order (newest first), whatever the radius and filters; only the fuel applies. */
export function pinnedRows(stations: Station[], fuel: Fuel, pins: string[], home: Place | null, discounts?: Discounts): PinnedItem[] {
  if (!pins.length) return [];
  const byId = new Map(stations.map((s) => [s.id, s]));
  return pins.map((id) => {
    const s = byId.get(id);
    const p = s?.p[fuel];
    if (!s || !p || p[0] == null) return { id, row: null, station: s ?? null };
    return { id, station: s, row: stationRow(s, p, home ? km(home.la, home.lo, s.la, s.lo) : null, discounts) };
  });
}

/** Today's one recommendation: the cheapest fresh price (after your discounts) among your pinned stations and the cheapest nearby ones. */
export function bestPick(rows: (StationRow | null | undefined)[]): StationRow | null {
  let best: StationRow | null = null;
  for (const r of rows) if (r && r.id && !isStale(r.age) && (!best || r.price < best.price)) best = r;
  return best;
}
