import type { Fuel } from './types';

export const FUELS: [Fuel, string][] = [
  ['U91', 'Unleaded 91'],
  ['E10', 'E10'],
  ['P98', 'Premium 98'],
  ['DL', 'Diesel'],
];

export const fuelName = (f: Fuel) => FUELS.find((x) => x[0] === f)![1];

/** Signed number, e.g. +1.2 / -0.4 / 0.0 */
export const fmt = (v: number, d = 1) => (v > 0 ? '+' : '') + v.toFixed(d);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-21" -> "21 Oct 2026" (dates are Sydney calendar days; never shifted by device timezone) */
export function nice(s: string, withYear = true) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

export const dayMs = 864e5;
const utc = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** ISO date k days after s */
export const addDays = (s: string, k: number) => new Date(utc(s) + k * dayMs).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / dayMs);

/** Today's date in Sydney as YYYY-MM-DD */
export function sydneyToday(now = new Date()) {
  // formatToParts, not format(): the en-CA string shape depends on the device's ICU data
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function updatedText(age: number | null) {
  if (age == null) return '';
  if (age === 0) return 'Updated today';
  if (age === 1) return 'Updated 1 day ago';
  return `Updated ${age} days ago`;
}

/** Words kept in capitals when an ALL-CAPS station name is title-cased */
const ACRONYMS = new Set(['BP', 'EG', 'APW', 'NRMA', 'NSW', 'LPG', 'RD', 'ST', 'MT', 'CVRO', 'IGA', 'U-GO']);

/** A station's display name: no "(members only)" tag, single spaces, and ALL-CAPS names ("SHELL NORTH ROCKS") in
 *  title case, keeping known acronyms (BP, EG, APW…). Names with any lower case are left as written. */
export function stationName(n: string): string {
  const name = n.replace(/\s*\(members only\)/i, '').replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(name) || !/[A-Z]{4}/.test(name)) return name;
  return name
    .split(' ')
    .map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase().replace(/(^|[-'’(])([a-z])/g, (_, p: string, ch: string) => p + ch.toUpperCase())))
    .join(' ');
}

/** "Brand · Suburb", without the brand when the station's name already contains it as whole words
 *  ("Enhance Merrylands", "Shell Reddy Express Parklea"). */
export function brandSuburb(name: string, brand: string, suburb: string): string {
  const esc = brand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return esc && new RegExp(`(^|\\W)${esc}(\\W|$)`, 'i').test(name) ? suburb : `${brand} · ${suburb}`;
}
