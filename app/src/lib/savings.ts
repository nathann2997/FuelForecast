// What your logged fills saved, in dollars. Two parts, both against the Sydney median for your fuel:
//   where: (median that day − what you paid) × litres          known at once (refined to the end-of-day median later)
//   when:  (average median over the 7 days after − median that day) × litres   once 5 of those 7 days are in history.json
// where + when = what you saved against paying the average price at a typical time that week. Either can be negative.
// The 7-day window is the same one the track record scores Bowser's calls on (sydney/pipeline/track_api.py).
import type { Fill } from './fills';
import { addDays, daysBetween } from './format';
import type { History } from './types';

export const WINDOW = 7;
export const MIN_DAYS = 5;

/** Sydney median for `fuel` on `date` from history.json (null if missing or out of range) */
export function medianOn(h: History, fuel: Fill['fuel'], date: string): number | null {
  const s = h.hist[fuel]?.med;
  if (!s) return null;
  const i = daysBetween(h.start, date);
  return i >= 0 && i < s.length && s[i] != null ? (s[i] as number) : null;
}

/** Average median over the WINDOW days after `date`, or null until at least MIN_DAYS of them are published */
export function weekAfter(h: History, fuel: Fill['fuel'], date: string): number | null {
  const vals: number[] = [];
  for (let k = 1; k <= WINDOW; k++) {
    const v = medianOn(h, fuel, addDays(date, k));
    if (v != null) vals.push(v);
  }
  const last = addDays(h.start, (h.hist[fuel]?.med.length ?? 0) - 1);
  // The window's last day must be over: history's last day is today, a partial day (same rule as track_api.window).
  // A gap day in a past week is fine; a day not yet published isn't.
  if (last <= addDays(date, WINDOW) || vals.length < MIN_DAYS) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export type FillSaving = { where: number | null; when: number | null; total: number | null; pending: boolean };

const dollars = (c: number, litres: number) => (c * litres) / 100;

/** One base for both parts, so where + when is exactly (week-after average − paid): the day's end-of-day median from
 *  history.json when it's published, else the median when you logged the fill. */
export function fillSaving(f: Fill, h: History | undefined): FillSaving {
  const base = (h ? medianOn(h, f.fuel, f.date) : null) ?? f.median;
  const where = base != null ? dollars(base - f.paid, f.litres) : null;
  const after = h ? weekAfter(h, f.fuel, f.date) : null;
  const when = base != null && after != null ? dollars(after - base, f.litres) : null;
  return { where, when, total: where == null && when == null ? null : (where ?? 0) + (when ?? 0), pending: when == null };
}

export type SavingsSummary = {
  n: number; litres: number; since: string | null;
  total: number; where: number; when: number;
  pending: number;             // fills whose "when" part isn't known yet
};

export function summarise(fills: Fill[], h: History | undefined): SavingsSummary {
  const out: SavingsSummary = { n: fills.length, litres: 0, since: null, total: 0, where: 0, when: 0, pending: 0 };
  for (const f of fills) {
    const s = fillSaving(f, h);
    out.litres += f.litres;
    if (!out.since || f.date < out.since) out.since = f.date;
    out.where += s.where ?? 0;
    out.when += s.when ?? 0;
    if (s.pending) out.pending++;
  }
  out.total = out.where + out.when;
  return out;
}

/** Cents rounded half away from zero, so −0.005 and 0.005 round alike */
export const roundCents = (v: number) => (Math.sign(v) * Math.round(Math.abs(v) * 100)) / 100;

/** "$12.40", "−$3.10", "$0.00" */
export function money(v: number) {
  const r = roundCents(v);
  return `${r < 0 ? '−' : ''}$${Math.abs(r).toFixed(2)}`;
}

/** What the confirmation says about a new fill: its "where" saving, known at once */
export function loggedText(f: Pick<Fill, 'paid' | 'litres' | 'median'>): string {
  if (f.median == null) return 'Logged.';
  const gap = f.median - f.paid;
  if (Math.abs(gap) < 0.05) return 'Logged. You paid the Sydney average.';
  const d = money(Math.abs((gap * f.litres) / 100));
  return gap > 0
    ? `Logged. ${gap.toFixed(1)}c under the Sydney average, about ${d} saved.`
    : `Logged. ${Math.abs(gap).toFixed(1)}c over the Sydney average, about ${d} more.`;
}
