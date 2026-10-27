// Series for the history chart: median, p10-p90 band, wholesale TGP, and the 14-day forecast fan,
// windowed to a range, as in renderMain() on the dashboard.
import { addDays, daysBetween } from './format';
import type { Ctx, Fuel, History, LiveRow, Series } from './types';

export const RANGES = [
  ['3M', 92],
  ['1Y', 365],
  ['3Y', 1095],
  ['All', 99999],
] as const;
export type RangeKey = (typeof RANGES)[number][0];

export type ChartData = {
  dates: string[];        // one per x index, history window + 14 forecast days
  asofIndex: number;
  med: Series; p10: Series; p90: Series; tgp: Series;
  fc: Series; lo: Series; hi: Series;
};

export function chartData(history: History, r: LiveRow, ctx: Ctx, fuel: Fuel, range: RangeKey): ChartData {
  const h = history.hist[fuel] ?? { med: [], p10: [], p90: [] };   // a fuel history.json doesn't carry yet
  const span = RANGES.find((x) => x[0] === range)![1];
  const n = history.hist[fuel] ? h.med.length : daysBetween(history.start, ctx.asof) + 1;   // no history yet: still honour the range
  const i0 = Math.max(0, n - span);
  const dates: string[] = [];
  for (let i = i0; i < n; i++) dates.push(addDays(history.start, i));
  const asofIndex = daysBetween(history.start, ctx.asof) - i0;
  const N = Math.max(dates.length, asofIndex + 15);
  while (dates.length < N) dates.push(addDays(history.start, i0 + dates.length));
  const nul = (): Series => new Array(N).fill(null);
  const med = nul(), p10 = nul(), p90 = nul(), tgp = nul(), fc = nul(), lo = nul(), hi = nul();
  const ts = fuel === 'DL' ? history.tgp.dl : history.tgp.ulp;
  for (let i = i0; i < n; i++) {
    med[i - i0] = h.med[i] ?? null; p10[i - i0] = h.p10[i] ?? null; p90[i - i0] = h.p90[i] ?? null; tgp[i - i0] = ts[i];
  }
  const pts = [
    [0, 0, 0, 0],
    [1, r.d1, r.lo1, r.hi1],
    [3, r.d3, r.lo3, r.hi3],
    [7, r.d7, r.lo7, r.hi7],
    [14, r.d14, r.lo14, r.hi14],
  ];
  for (let k = 0; k < pts.length - 1; k++) {
    const [h0, d0, l0, u0] = pts[k], [h1, d1, l1, u1] = pts[k + 1];
    for (let s = h0; s <= h1; s++) {
      const t = (s - h0) / (h1 - h0), i = asofIndex + s;
      fc[i] = r.now + d0 + (d1 - d0) * t;
      lo[i] = r.now + l0 + (l1 - l0) * t;
      hi[i] = r.now + u0 + (u1 - u0) * t;
    }
  }
  return { dates, asofIndex, med, p10, p90, tgp, fc, lo, hi };
}

/** y-axis bounds over every non-null value, padded to round 10c steps */
export function yBounds(d: ChartData) {
  let mn = Infinity, mx = -Infinity;
  for (const s of [d.med, d.p10, d.p90, d.tgp, d.lo, d.hi])
    for (const v of s) if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!isFinite(mn)) return { min: 0, max: 1 };
  return { min: Math.floor(mn / 10) * 10, max: Math.ceil(mx / 10) * 10 };
}
