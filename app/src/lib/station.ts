// The station ("ticker") page: pure helpers that turn station/{id}.json plus the Sydney median history into
// what the page shows. No React here, so it can be tested on its own (src/lib/__tests__/station.test.ts).

import { addDays, daysBetween, FUELS, nice } from './format';
import { dayLabel, tankSaving, type Tone } from './outlook';
import type { Fuel, History, Series, StationDetail, StationForecast, StationProfile } from './types';

export const RANGES = [
  ['1W', 7],
  ['1M', 30],
  ['3M', 91],
  ['6M', 182],
  ['1Y', 365],
] as const;
export type RangeKey = (typeof RANGES)[number][0];

/** Day-over-day rise that counts as a price jump, c/L */
export const JUMP_C = 5;
export const FC_DAYS = 14;

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v);
const hasData = (s: Series | undefined) => !!s && s.some(isNum);

/** Fuels this station sells (a forecast for today or any known price), in the app's usual order */
export function fuelsSold(d: StationDetail): Fuel[] {
  return FUELS.map(([f]) => f).filter((f) => !!d.fc[f] || hasData(d.hist[f]));
}

/** The user's fuel if this station sells it, else the first fuel it does sell */
export function pickFuel(sold: Fuel[], preferred: Fuel): Fuel | null {
  return sold.includes(preferred) ? preferred : (sold[0] ?? null);
}

/** Index of `asof` in the station's history (clamped to the series) */
export function asofIndex(d: StationDetail, s: Series) {
  return Math.min(s.length - 1, daysBetween(d.start, d.asof));
}

export type Change = { c: number; pct: number } | null;

function change(now: number | null, then: number | null | undefined): Change {
  if (!isNum(now) || !isNum(then) || then === 0) return null;
  return { c: now - then, pct: ((now - then) / then) * 100 };
}

export type Ticker = {
  price: number | null;          // today's price, c/L
  d1: Change;                    // vs yesterday
  d7: Change;                    // vs 7 days ago
  gap: number | null;            // vs today's Sydney median (negative = cheaper)
  unchangedDays: number | null;  // days the price has sat at this level (from the history)
};

/** The ticker block: price, change since yesterday and over 7 days, and the gap to the Sydney median */
export function ticker(d: StationDetail, fuel: Fuel, medianNow: number | null | undefined): Ticker {
  const s = d.hist[fuel] ?? [];
  const i = s.length ? asofIndex(d, s) : -1;
  const fromHist = i >= 0 ? s[i] : null;
  const price = d.fc[fuel]?.now ?? (isNum(fromHist) ? fromHist : null);
  let unchangedDays: number | null = null;
  if (isNum(price) && i >= 0 && isNum(s[i])) {
    let k = i;
    while (k > 0 && isNum(s[k - 1]) && Math.abs((s[k - 1] as number) - price) < 0.05) k--;
    unchangedDays = i - k;
  }
  return {
    price,
    d1: i >= 1 ? change(price, s[i - 1]) : null,
    d7: i >= 7 ? change(price, s[i - 7]) : null,
    gap: isNum(price) && isNum(medianNow) ? price - medianNow : null,
    unchangedDays,
  };
}

/** Expected change vs now for days 0..14, linear between the 1/3/7/14-day horizons (as path() in outlook.ts) */
export function fcPath(f: StationForecast, key: 'd' | 'lo' | 'hi' = 'd'): number[] {
  const xs = [0, 1, 3, 7, 14];
  const ys = [0, f[`${key}1`], f[`${key}3`], f[`${key}7`], f[`${key}14`]];
  return Array.from({ length: FC_DAYS + 1 }, (_, h) => {
    let k = 1;
    while (xs[k] < h) k++;
    const t = (h - xs[k - 1]) / (xs[k] - xs[k - 1]);
    return ys[k - 1] + t * (ys[k] - ys[k - 1]);
  });
}

export type TickerData = {
  dates: string[];   // one per x index: the history window, then the forecast days
  today: number;     // index of asof (the "today" divider); -1 if the window has no history
  px: Series;        // the station's price, history only
  med: Series;       // Sydney median, history only
  fc: Series; lo: Series; hi: Series;   // forecast from today (fc[today] = today's price)
};

/** Chart series for one range: the station's last `span` days, the Sydney median on the same days and the
 *  14-day forecast continuation. Leading days before the station has any price are trimmed. */
export function tickerData(
  d: StationDetail, history: History | null | undefined, fuel: Fuel, range: RangeKey,
): TickerData {
  const span = RANGES.find((r) => r[0] === range)![1];
  const s = d.hist[fuel] ?? [];
  const f = d.fc[fuel];
  const end = s.length ? asofIndex(d, s) : -1;
  let i0 = Math.max(0, end - span);
  while (i0 < end && !isNum(s[i0])) i0++;
  const hasHist = end >= 0 && s.slice(i0, end + 1).some(isNum);
  const nHist = hasHist ? end - i0 + 1 : 0;
  const nFc = f ? FC_DAYS : 0;
  const N = nHist + nFc + (hasHist || !f ? 0 : 1);   // forecast-only: day 0 is today
  const first = hasHist ? addDays(d.start, i0) : d.asof;
  const dates = Array.from({ length: N }, (_, k) => addDays(first, k));
  const nul = (): Series => new Array(N).fill(null);
  const px = nul(), med = nul(), fc = nul(), lo = nul(), hi = nul();
  for (let k = 0; k < nHist; k++) px[k] = isNum(s[i0 + k]) ? s[i0 + k] : null;
  const hm = history?.hist[fuel]?.med;
  if (hm && history) {
    const off = daysBetween(history.start, first);
    for (let k = 0; k < Math.max(nHist, 1) && k < N; k++) {
      const v = hm[off + k];
      med[k] = isNum(v) ? v : null;
    }
  }
  const today = hasHist ? nHist - 1 : f ? 0 : -1;
  if (f && today >= 0) {
    const pd = fcPath(f), pl = fcPath(f, 'lo'), ph = fcPath(f, 'hi');
    for (let h = 0; h <= FC_DAYS; h++) {
      fc[today + h] = f.now + pd[h];
      lo[today + h] = f.now + pl[h];
      hi[today + h] = f.now + ph[h];
    }
  }
  return { dates, today, px, med, fc, lo, hi };
}

export type RangeStats = {
  low: { v: number; date: string } | null;
  high: { v: number; date: string } | null;
  avg: number | null;
  avgGap: number | null;   // mean of (station - median) on days with both (negative = cheaper)
  jumps: number;           // day-over-day rises of JUMP_C or more
  days: number;            // days with a price
};

/** Low, high, average vs the median and the number of price jumps over the history part of the window */
export function rangeStats(t: TickerData): RangeStats {
  let low: RangeStats['low'] = null, high: RangeStats['high'] = null;
  let sum = 0, n = 0, gapSum = 0, gapN = 0, jumps = 0;
  let prev: number | null = null;
  const last = t.today;
  for (let k = 0; k <= last && k < t.px.length; k++) {
    const v = t.px[k];
    if (!isNum(v)) continue;
    if (!low || v < low.v) low = { v, date: t.dates[k] };
    if (!high || v > high.v) high = { v, date: t.dates[k] };
    sum += v; n++;
    const m = t.med[k];
    if (isNum(m)) { gapSum += v - m; gapN++; }
    if (prev != null && v - prev >= JUMP_C - 1e-9) jumps++;
    prev = v;
  }
  return { low, high, avg: n ? sum / n : null, avgGap: gapN ? gapSum / gapN : null, jumps, days: n };
}

/** y-axis bounds and ticks over every non-null value, on a round step chosen for ~3-5 gridlines */
export function tickerBounds(t: TickerData) {
  let mn = Infinity, mx = -Infinity;
  for (const s of [t.px, t.med, t.lo, t.hi, t.fc])
    for (const v of s) if (isNum(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  if (!isFinite(mn)) return { min: 0, max: 1, ticks: [] as number[] };
  if (mx - mn < 2) { mn -= 1; mx += 1; }
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => (mx - mn) / s <= 4) ?? 100;
  const min = Math.floor(mn / step) * step, max = Math.ceil(mx / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  return { min, max, ticks };
}

export type Tile = { h: 1 | 3 | 7 | 14; label: string; date: string; v: number; lo: number; hi: number; delta: number };

/** The 1 / 3 / 7 / 14-day price tiles */
export function forecastTiles(f: StationForecast, asof: string): Tile[] {
  return ([[1, 'Tomorrow'], [3, '3 days'], [7, '7 days'], [14, '14 days']] as const).map(([h, label]) => ({
    h, label, date: addDays(asof, h),
    v: f.now + f[`d${h}`], lo: f.now + f[`lo${h}`], hi: f.now + f[`hi${h}`], delta: f[`d${h}`],
  }));
}

/** The rise line for this station's rise date, worded by the Sydney verdict tone exactly as Today and the
 *  widget word it (widget/logic.ts riseText, outlook.ts deadline): a firm "Likely to rise" only when the verdict
 *  says act, otherwise "Jump possible". `tone` is toneOf(verdict.cls) for this fuel; unknown reads as not act. */
export function riseText(f: StationForecast, asof: string, tone: Tone | undefined) {
  if (!f.rise) return 'No rise expected in 14 days';
  const act = tone === 'act';
  const k = daysBetween(asof, f.rise);
  if (k <= 0) return act ? 'Prices likely rising now' : 'A jump is possible any day';
  const when = k === 1 ? 'tomorrow' : dayLabel(f.rise);
  return act ? `Likely to rise from ${when}` : `Jump possible from ${when}`;
}

const dollars = (v: number) => (Math.abs(v) >= 10 ? `$${Math.abs(v).toFixed(0)}` : `$${Math.abs(v).toFixed(2)}`);

/** What the forecast means for one tank: fill before the rise, or wait for the low */
export function tankText(f: StationForecast, asof: string, tankL: number, tone: Tone | undefined) {
  const hs = [1, 3, 7, 14] as const;
  const peak = Math.max(...hs.map((h) => f[`d${h}`]));
  const lowH = hs.reduce((a, h) => (f[`d${h}`] < f[`d${a}`] ? h : a), 1 as (typeof hs)[number]);
  const low = f[`d${lowH}`];
  if (f.rise && peak >= 1) {
    const when = daysBetween(asof, f.rise) <= 1 ? 'today' : `before ${dayLabel(f.rise)}`;
    if (tone !== 'act')
      return `If prices do jump, filling ${when} saves about ${dollars(tankSaving(peak, tankL))} on a ${tankL} L tank.`;
    return `Filling ${when} saves about ${dollars(tankSaving(peak, tankL))} on a ${tankL} L tank.`;
  }
  if (low <= -1) return `Waiting until ${dayLabel(addDays(asof, lowH))} could save about ${dollars(tankSaving(-low, tankL))} on a ${tankL} L tank.`;
  if (peak >= 1) return `Expected to drift up about ${peak.toFixed(0)}c, about ${dollars(tankSaving(peak, tankL))} on a ${tankL} L tank.`;
  return `Expected to stay within a cent or two, so it makes little difference to a ${tankL} L tank.`;
}

/** "How this station behaves", in plain English. Empty when there is too little history to say. */
export function behaviour(p: StationProfile | null | undefined, fuel: Fuel): string[] {
  if (!p) return [];
  const out: string[] = [];
  const name = FUELS.find((x) => x[0] === fuel)![1];
  const typ = p.typ[fuel];
  if (isNum(typ))
    out.push(Math.abs(typ) < 0.5
      ? `Usually prices ${name} at about the Sydney median.`
      : `Usually about ${Math.abs(typ).toFixed(1)}c ${typ < 0 ? 'cheaper' : 'dearer'} than the Sydney median for ${name}.`);
  if (p.n >= 3) {
    if (isNum(p.part)) {
      const k = Math.round(p.part * 10);
      out.push(k <= 1
        ? 'A steady pricer: rarely joins Sydney price jumps.'
        : p.part < 0.4
        ? `A steady pricer: joins only about ${k} in 10 Sydney price jumps.`
        : k >= 10 ? 'Joins nearly every Sydney price jump.' : `Joins about ${k} in 10 Sydney price jumps.`);
    }
    if (isNum(p.lag) && (p.part ?? 1) >= 0.2) {
      const days = Math.round(p.lag / 24);
      out.push(p.lag < 12
        ? 'When prices jump, it usually rises with the first wave.'
        : days <= 1
          ? 'When prices jump, it usually rises about 1 day after most of Sydney.'
          : `When prices jump, it usually rises about ${days} days after most of Sydney.`);
    }
  }
  return out;
}

/** Spoken summary of the chart for screen readers */
export function chartSummary(t: TickerData, st: RangeStats, fuel: Fuel, range: RangeKey): string {
  const name = FUELS.find((x) => x[0] === fuel)![1];
  const parts: string[] = [];
  if (st.low && st.high)
    parts.push(`${name} at this station over ${rangeName(range)}: low ${st.low.v.toFixed(1)} cents on ${nice(st.low.date, false)}, high ${st.high.v.toFixed(1)} cents on ${nice(st.high.date, false)}`);
  else parts.push(`No price history for ${name} at this station yet`);
  if (st.avgGap != null) parts.push(`on average ${Math.abs(st.avgGap).toFixed(1)} cents ${st.avgGap < 0 ? 'below' : 'above'} the Sydney median`);
  const e = t.fc[t.fc.length - 1], l = t.lo[t.lo.length - 1], h = t.hi[t.hi.length - 1];
  if (isNum(e) && isNum(l) && isNum(h)) parts.push(`forecast ${e.toFixed(0)} cents in 14 days, likely between ${l.toFixed(0)} and ${h.toFixed(0)}`);
  return parts.join('; ') + '.';
}

export const rangeName = (r: RangeKey) =>
  ({ '1W': 'the last week', '1M': 'the last month', '3M': 'the last 3 months', '6M': 'the last 6 months', '1Y': 'the last year' })[r];

export { openDirections } from './directions';
