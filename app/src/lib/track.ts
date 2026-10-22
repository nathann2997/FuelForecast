// The track record (track.json, sydney/pipeline/track_api.py) in words: the headline hit rate, what happened after
// each call, and what following it was worth on your tank.
import { nice } from './format';
import { dollars } from './outlook';
import type { Call, CallStatus, Fuel, Track } from './types';

/** Live calls take over the headline once this many have been scored; until then it's the replayed backtest */
export const LIVE_MIN = 10;

/** `short`: the sub line for a narrow tile ("12 calls", "tested 2021–26") */
export type Headline = { pct: number; n: number; live: boolean; text: string; sub: string; short: string };

export function headline(t: Track, fuel: Fuel): Headline | null {
  const live = t.live?.[fuel];
  if (live && live.n >= LIVE_MIN) {
    const pct = Math.round((live.right / live.n) * 100);
    return {
      pct, n: live.n, live: true, text: `Right ${pct}% of the time`,
      sub: `${live.n} calls since ${nice(live.since ?? live.from!, false)}`, short: `${live.n} calls`,
    };
  }
  const r = t.replay?.[fuel];
  if (!r || !r.n) return null;
  const pct = Math.round((r.right / r.n) * 100);
  const years = r.from && r.to ? `${r.from.slice(0, 4)}–${r.to.slice(0, 4)}` : 'past';
  const yy = r.from && r.to ? `${r.from.slice(0, 4)}–${r.to.slice(2, 4)}` : 'on past prices';
  return { pct, n: r.n, live: false, text: `Right ${pct}% of the time`, sub: `tested on ${years} prices`, short: `tested ${yy}` };
}

export const MARK: Record<CallStatus, string> = { right: '✓', close: '≈', wrong: '✗', pending: '…' };
export const STATUS_WORD: Record<CallStatus, string> = { right: 'Right', close: 'Close call', wrong: 'Wrong', pending: 'Too early to tell' };

/** What the call said, in a few words: "Fill" / "Wait" / "No rush" */
export const callWord = (c: Pick<Call, 'cls'>) => (c.cls === 'up' ? 'Fill' : c.cls === 'down' ? 'Wait' : 'No rush');

/** What happened after a call, against the median on the day */
export function outcomeText(c: Call, window = 7): string {
  if (c.move == null) return 'Too early to tell';
  const m = Math.abs(c.move);
  const dir = m < 0.5 ? null : c.move > 0 ? 'higher' : 'lower';
  if (c.status === 'pending') return `So far ${dir ? `${m.toFixed(1)}c ${dir}` : 'about the same'} (${c.days} of ${window} days)`;
  return dir ? `Prices averaged ${m.toFixed(1)}c ${dir} the week after` : 'Prices held steady the week after';
}

/** Dollars that following the call was worth on a tank (positive = it paid off); null for "No rush" or no outcome */
export function callValue(c: Call, tankL: number): { text: string; good: boolean } | null {
  if (c.move == null || c.status === 'pending' || c.cls === 'flat') return null;
  const gain = c.cls === 'up' ? c.move : -c.move;   // filling before a rise, or waiting through a fall
  if (Math.abs(gain) < 0.5) return null;
  return { text: `${gain > 0 ? 'Saved' : 'Cost'} about ${dollars(gain, tankL)} a tank`, good: gain > 0 };
}

/** Calls for one fuel, newest first */
export const callsFor = (t: Track, fuel: Fuel) => t.calls.filter((c) => c.fuel === fuel);
