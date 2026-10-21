// Text and derived numbers for the screens, ported from the dashboard (sydney/pipeline/template.html)
// so the app says exactly what the web page says. Keep the two in step.
import { daysBetween, fmt, fuelName, nice } from './format';
import type { AdviceCode, Ctx, Forecast, Fuel, History, LiveRow, Stats, VerdictCls } from './types';

/** Wholesale TGP k days before asof (walking back over gaps), as in renderSignal() */
function tgpBack(history: History, fuel: Fuel, asof: string, k: number) {
  const tg = fuel === 'DL' ? history.tgp.dl : history.tgp.ulp;
  for (let i = daysBetween(history.start, asof) - k; i >= 0; i--) if (tg[i] != null) return tg[i] as number;
  return null;
}

/** The "why" paragraph under the verdict */
export function signalWhy(r: LiveRow, stats: Stats, ctx: Ctx, history: History | undefined) {
  const t0 = history ? tgpBack(history, r.fuel, ctx.asof, 0) : null;
  const t28 = history ? tgpBack(history, r.fuel, ctx.asof, 28) : null;
  const moved = t0 != null && t28 != null ? fmt(t0 - t28, 0) : null;
  const typ = stats.margin_typ ?? 12;   // 2019-25 typical U91 margin, if the stat is missing
  let why: string;
  if (r.fuel === 'DL')
    why = `Pump diesel is ${r.margin.toFixed(0)}c above wholesale${moved ? `, and wholesale diesel moved ${moved}c over the last four weeks` : ''}.`;
  else if (r.fuel === 'P98')
    why = `Premium 98 carries a ${r.margin.toFixed(0)}c margin over the unleaded wholesale price, so it reacts less to the cycle than U91.`;
  else
    why =
      `Retailers are selling ${r.margin.toFixed(1)}c above the wholesale price, against a typical ${typ.toFixed(0)}c` +
      (moved ? `, after wholesale moved ${moved}c in four weeks` : '') +
      `. ${r.margin < typ - 6 ? 'Thin margins usually end in a price jump.' : r.margin > typ + 8 ? 'Fat margins usually get discounted away.' : ''}`;
  const path =
    r.d7 > 0.9 ? `up about ${r.d7.toFixed(1)}c over 7 days` : r.d7 < -0.9 ? `down about ${Math.abs(r.d7).toFixed(1)}c over 7 days` : 'roughly flat over the next week';
  return `Expected ${path}. ${why}`.trim();
}

export type Horizon = { label: string; value: number; delta: number; cls: VerdictCls; lo: number; hi: number };

export function horizons(r: LiveRow): Horizon[] {
  return ([[1, 'Tomorrow'], [3, 'In 3 days'], [7, 'In 7 days'], [14, 'In 14 days']] as const).map(([h, label]) => {
    const d = r[`d${h}`];
    return {
      label,
      value: r.now + d,
      delta: d,
      cls: d > 0.4 ? 'up' : d < -0.4 ? 'down' : 'flat',
      lo: r.now + r[`lo${h}`],
      hi: r.now + r[`hi${h}`],
    };
  });
}

export function jumpRisk(r: LiveRow): { pct: number; label: string; cls: VerdictCls } {
  const pct = Math.round(r.p_jump7 * 100);
  return { pct, label: pct >= 50 ? 'High' : pct <= 15 ? 'Low' : 'Moderate', cls: pct >= 50 ? 'up' : pct <= 15 ? 'down' : 'flat' };
}

/** Station advice code -> colour class, as ADV in the dashboard */
export const ADVICE_CLS: Record<AdviceCode, VerdictCls> = { now: 'up', by: 'up', hi: 'down', wait: 'down', any: 'flat', ok: 'flat', chk: 'flat' };

export const WHEN_NOTE =
  'Each date is the Sydney forecast adjusted for the station: how fast it usually follows a price jump, and whether it follows them at all.';

/** Stats/ctx values can be null if a pipeline input is missing; render a dash instead of crashing */
const n = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));
const day = (s: string | null | undefined) => (s ? nice(s) : '–');

export function insights(f: Forecast): { title: string; big: string; body: string }[] {
  const ST = f.stats, CTX = f.ctx;
  const sinceJump = ST.last_restore ? daysBetween(ST.last_restore, CTX.asof) : null;
  const dow = ST.dow.map((v) => v ?? 0);
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const lo = dow.indexOf(Math.min(...dow)), hi = dow.indexOf(Math.max(...dow));
  const gap = ST.cycle_gap_calm;
  return [
    { title: 'The Sydney cycle', big: gap != null ? `${Math.round(gap / 7)} weeks` : '–', body: `Normally prices jump about ${n(ST.cycle_amp_calm)}c every ${n(gap)} days, then slide back slowly.` },
    { title: 'Where we are now', big: sinceJump != null ? `${sinceJump} days` : 'n/a', body: `since the last jump${ST.last_restore ? ` on ${nice(ST.last_restore)}` : ''}.${sinceJump != null && gap != null && sinceJump > gap ? ' Longer than a normal cycle.' : ''}` },
    { title: 'Margin today', big: `${n(ST.margin_now, 1)}c`, body: `U91 over wholesale, against a typical ${n(ST.margin_typ)}c. Thin margins usually end in a jump.` },
    { title: 'Day of week', big: 'under 1c', body: `${names[lo]} is cheapest and ${names[hi]} dearest, but the gap is under 1c. The cycle matters far more.` },
    { title: 'Shop around', big: `${n(ST.shop_around)}c`, body: 'How much less the cheapest 10% of stations charge than the median, on a typical day.' },
    { title: 'Diesel premium', big: `${n(ST.dl_gap_now)}c`, body: `Over U91 today, against ${n(ST.dl_gap_2019_25)}c on average from 2019 to 2025.` },
    { title: 'E10 and Premium', big: `${n(ST.e10_disc)}c / ${n(ST.p98_prem)}c`, body: `E10 below U91, Premium 98 above, on average since 2023.` },
    { title: 'Since 2019', big: `${n(ST.low_2019)}c → ${n(ST.high_all)}c`, body: `Sydney U91 median, from the 2020 low to the high on ${day(ST.high_date)}.` },
    { title: 'Oil today', big: `US$${n(CTX.brent_usd)}`, body: `Brent crude a barrel, about A$${n(CTX.brent_aud)} (${day(CTX.fred_last)}).` },
  ];
}

/** One plain sentence on where Sydney is in the price cycle, for the top of Trends ('' when the stats are missing). */
export function cycleSummary(f: Forecast): string {
  const ST = f.stats;
  const since = ST.last_restore ? daysBetween(ST.last_restore, f.ctx.asof) : null;
  const gap = ST.cycle_gap_calm;
  const thin = ST.margin_now != null && ST.margin_typ != null && ST.margin_now < ST.margin_typ - 6;
  if (since == null || gap == null) return thin ? 'Margins are thin, so a price jump is likely soon.' : '';
  if (since <= 3) return 'Prices have just jumped and should slide back over the coming weeks.';
  if (thin || since >= gap) return `Late in the cycle: ${since} days since the last jump, so the next one is due.`;
  if (since < gap / 2) return `Early in the cycle: prices are sliding back after the jump ${since} days ago.`;
  return `Mid-cycle: prices are still sliding, ${since} days since the last jump.`;
}

export function backtestRows(f: Forecast, fuel: Fuel) {
  const S = f.bt.summary, prod = f.bt.prod;
  return [1, 3, 7, 14].map((h) => {
    const r = S[`${fuel}|${h}`];
    return {
      horizon: `${h} day${h > 1 ? 's' : ''}`,
      naive: r.naive,
      model: r[prod],
      gain: Math.round((1 - r[prod] / r.naive) * 100),
      shock: `${r.model_shock.toFixed(1)} vs ${r.naive_shock.toFixed(1)}`,
      dir: Math.round(r.dir * 100),
    };
  });
}

export function backtestNote(f: Forecast, fuel: Fuel) {
  return `${fuelName(fuel)}, mean absolute error in c/L, tested ${f.bt.test_from} to ${f.bt.test_to.slice(0, 7)}. "Shock months" are the 2022 and 2026 oil shocks (model vs no change). Direction counts moves of 1c or more. Price-jump classifier AUC ${f.bt.auc[fuel].toFixed(2)} (0.5 is a coin toss).`;
}

export function historyNote(ctx: Ctx) {
  if (!ctx.history_last) return '';
  const gapDays = daysBetween(ctx.history_last, ctx.asof) - (ctx.snapshot_days ?? 0);
  return gapDays > 3
    ? `Gaps fill in when NSW publishes each month's history, about a month late (latest: ${nice(ctx.history_last)}).`
    : '';
}

/** meta.warnings from the daily export, in plain English. Anything not recognised is technical and is hidden. */
export function plainWarnings(warnings: string[]): string[] {
  const out: string[] = [];
  for (const w of warnings) {
    const age = w.match(/^(tgp_last|fred_last) is (\d+) days old/);
    if (age) {
      out.push(
        age[1] === 'tgp_last'
          ? `Wholesale prices haven’t updated for ${age[2]} days, so the forecast uses the last known ones.`
          : `Oil price and exchange rate data haven’t updated for ${age[2]} days, so the forecast uses the last known ones.`,
      );
    } else if (/^station files unavailable/i.test(w)) {
      out.push('Station price history isn’t available today.');
    }
  }
  return [...new Set(out)];
}

/** Copy for More → Widget location, from the background location status and the saved area. The widget follows the
 *  phone only when background location is allowed, location is on and the area is GPS-based or unset.
 *  `opensSettings`: Android 11+ answers the background request with the Settings page, so say what to pick first. */
export function widgetLocationCopy(
  bg: { status: 'granted' | 'denied' | 'undetermined' | 'unsupported'; canAskAgain: boolean; servicesOff?: boolean },
  home: { label: string; gps?: boolean } | null,
  opensSettings = false,
): { status: string; action: 'ask' | 'settings' | 'services' | null; note: string | null; hint: string | null } {
  const typed = home && !home.gps ? home.label : null;
  const note = typed ? `Your area is set to ${typed}. Switch to Use my location for the widget to follow you.` : null;
  if (bg.status === 'unsupported') return { status: 'Off', action: null, note: null, hint: null };
  if (bg.servicesOff) return { status: 'Location is off on this phone', action: 'services', note, hint: null };
  const on = bg.status === 'granted' && !typed;
  const action = bg.status === 'granted' ? null : bg.canAskAgain ? 'ask' : 'settings';
  return {
    status: on ? 'On' : home ? `Off – widget uses ${typed ?? 'where you last opened Bowser'}` : 'Off – no area set for the widget',
    action,
    note,
    hint: action === 'ask' && opensSettings ? 'Next, choose Allow all the time.' : null,
  };
}
