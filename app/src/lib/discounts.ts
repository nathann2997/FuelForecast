// Your discounts by brand (a supermarket docket, a fuel card, a membership), and the price you pay after them.
// Kept in settings on the phone. The user says which brands take their discounts; Bowser never guesses.

export type Discounts = Record<string, number>;   // brand (as in stations.json `b`) -> cents off per litre

export const MAX_DISCOUNTS = 12;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const MIN_OFF = 0.5;
export const MAX_OFF = 30;
export const DEFAULT_OFF = 4;

/** Only well-formed entries: a brand name and a cents value in range (rounded to 0.5c), at most MAX_DISCOUNTS. */
export function cleanDiscounts(raw: unknown): Discounts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Discounts = {};
  for (const [b, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_DISCOUNTS) break;
    if (!b.trim() || b.length > 60 || b === '__proto__' || typeof v !== 'number' || !Number.isFinite(v)) continue;
    const c = Math.round(v * 2) / 2;
    if (c >= MIN_OFF && c <= MAX_OFF) out[b] = c;
  }
  return out;
}

/** Cents off at a brand (0 when you have no discount there) */
export const offFor = (d: Discounts | undefined, brand: string) => (d && own(d, brand) ? d[brand] : 0);

/** Pump price less your discount, to 0.1c */
export const yourPrice = (pump: number, off: number) => Math.round((pump - off) * 10) / 10;

/** A discount added, changed (cents) or removed (null). Adding past MAX_DISCOUNTS leaves the list as it was. */
export function withDiscount(d: Discounts, brand: string, cents: number | null): Discounts {
  const next = { ...d };
  if (cents == null) delete next[brand];
  else if (own(next, brand) || Object.keys(next).length < MAX_DISCOUNTS) next[brand] = cents;
  return cleanDiscounts(next);
}

/** "4c" / "4.5c" */
export const offText = (c: number) => `${Number.isInteger(c) ? c.toFixed(0) : c.toFixed(1)}c`;
