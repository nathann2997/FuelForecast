// The plain-language outlook on Today: the day Sydney prices are likely to rise, the expected path, and what it
// means in dollars for one tank. The rise day is market() in sydney/pipeline/build.py, ported so the headline
// and the station "Fill by" chips point at the same date. Keep the two in step.
import { addDays } from './format';
import type { LiveRow, VerdictCls } from './types';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-24" -> "Sat 24 Oct", as dow() in build.py */
export function dayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MO[m - 1]}`;
}

/** Expected change in the median for days 0..14, linear between the model's 1/3/7/14-day horizons */
export function path(r: LiveRow, key: 'd' | 'lo' | 'hi' = 'd'): number[] {
  const xs = [0, 1, 3, 7, 14];
  const ys = [0, r[`${key}1`], r[`${key}3`], r[`${key}7`], r[`${key}14`]];
  return Array.from({ length: 15 }, (_, h) => {
    let k = 1;
    while (xs[k] < h) k++;
    const t = (h - xs[k - 1]) / (xs[k] - xs[k - 1]);
    return ys[k - 1] + t * (ys[k] - ys[k - 1]);
  });
}

/** First day (1..14) Sydney prices are likely to rise: the path is 5c+ higher, or the cumulative jump risk passes 25% */
export function riseDay(r: LiveRow): number | null {
  const d = path(r);
  let J: number | null = null;
  for (let h = 1; h <= 14; h++) if (d[h] >= 5) { J = h; break; }
  const p7 = Math.min(Math.max(r.p_jump7, 1e-3), 0.99);
  const lam = 1 - (1 - p7) ** (1 / 7);
  const k = Math.floor(Math.log(0.75) / Math.log(1 - lam)) + 1;
  if (k <= 14) J = Math.min(J ?? 99, k);
  return J;
}

export type Tone = 'act' | 'wait' | 'calm';
export const toneOf = (cls: VerdictCls): Tone => (cls === 'up' ? 'act' : cls === 'down' ? 'wait' : 'calm');

export type Outlook = {
  tone: Tone;
  head: string;          // the shared verdict headline
  deadline: string | null;  // "Prices likely to rise from Sat 24 Oct"
  riseDate: string | null;  // ISO date of the rise day
  detail: string;        // what it means in dollars
  move14: number;        // expected change by day 14, c/L
};

export const dollars = (cents: number, litres: number) => {
  const v = (Math.abs(cents) * litres) / 100;
  return v >= 10 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;
};

export function outlook(r: LiveRow, asof: string, tankL: number): Outlook {
  const tone = toneOf(r.verdict.cls);
  const J = riseDay(r);
  const riseDate = J == null ? null : addDays(asof, J);
  const end = dayLabel(addDays(asof, 14));
  const d14 = r.d14, d7 = r.d7;
  const risk = riseDate ? ` Some chance of a jump from ${dayLabel(riseDate)}.` : '';
  let detail: string;
  if (tone === 'act')
    detail = d14 >= 3
      ? `About ${d14.toFixed(0)}c higher by ${end}. Filling ${J == null ? 'soon' : 'before then'} saves about ${dollars(d14, tankL)} on a ${tankL} L tank.`
      : `Fill up before then. Over two weeks the average move is about ${d14 >= 0 ? '+' : ''}${d14.toFixed(0)}c.`;
  else if (d7 <= -2)
    detail = `About ${Math.abs(d7).toFixed(0)}c lower by ${dayLabel(addDays(asof, 7))}. Waiting saves about ${dollars(d7, tankL)} on a ${tankL} L tank.${risk}`;
  else if (tone === 'wait')
    detail = `Prices should ease over the next few days.${risk}`;
  else if (d14 >= 3)
    detail = `About ${d14.toFixed(0)}c higher by ${end}. Filling soon saves about ${dollars(d14, tankL)} on a ${tankL} L tank.${risk}`;
  else
    detail = `Steady for the next two weeks. Fill up whenever suits.${risk}`;
  return {
    tone,
    head: r.verdict.head,
    // A firm deadline only when the verdict says to act; otherwise the rise risk is a softer line in the detail
    deadline: tone !== 'act' || J == null ? null : J <= 1 ? 'Prices likely to rise from tomorrow' : `Prices likely to rise from ${dayLabel(riseDate!)}`,
    riseDate,
    detail,
    move14: d14,
  };
}

/** Dollars saved on a tank by paying `delta` c/L less (positive = saving) */
export const tankSaving = (deltaC: number, tankL: number) => (deltaC * tankL) / 100;
