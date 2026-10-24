// iOS widget props: the shared widget model (./logic.ts buildModel) flattened to plain strings for the WidgetKit
// widget in ./ios-widget.tsx, plus the timeline that keeps day-relative text ("rise from tomorrow", "as of") right
// after midnight while Bowser stays closed. Pure: no React Native or expo-widgets imports, so it runs under jest.
import { addDays, sydneyToday } from '@/lib/format';
import type { Tone } from '@/lib/outlook';

import { TODAY_URI, buildModel, type NoteTone, type WidgetModel, type WidgetPrefs, type WidgetSnapshot } from './logic';

/** Rows the large widget can show; the medium shows the first 3 (the layout picks). */
export const IOS_MAX_ROWS = 6;

export type IosRow = { name: string; price: string; advice: string; adviceTone: NoteTone; fc: string | null; fcTone: NoteTone; url: string };

export type IosWidgetProps = {
  tone: Tone;
  fuel: string;                 // "U91"
  head: string;                 // verdict headline, or "Open Bowser"
  rise: string | null;          // "Likely to rise from Sat 24 Oct"
  riseShort: string | null;     // "Rise from Sat"
  sydney: string | null;        // "237.9 → 240.4 in 7 days"
  sydneyTone: NoteTone;
  asOf: string | null;          // "as of 20 Oct" when the data isn't today's
  caption: string;              // what the list is: "Pinned", "Cheapest near Parramatta 2150"
  rows: IosRow[];
  message: string | null;       // shown instead of rows
  best: { price: string; name: string; url: string } | null;
  url: string;                  // where a tap on the widget (outside a row) goes
};

/** Props for an empty widget before the app has loaded anything (also createWidget's initial props). */
export const EMPTY_PROPS: IosWidgetProps = {
  tone: 'calm', fuel: 'U91', head: 'Open Bowser', rise: 'to load today’s outlook', riseShort: 'to load prices', sydney: null,
  sydneyTone: 'flat', asOf: null, caption: '', rows: [], message: 'Open Bowser to load prices', best: null, url: TODAY_URI,
};

export function iosProps(m: WidgetModel): IosWidgetProps {
  const caption =
    m.mode === 'pinned' ? 'Pinned' : m.mode === 'nearby' && m.caption ? `Cheapest ${m.caption.replace(/^Near /, 'near ')}` : (m.caption ?? '');
  return {
    tone: m.tone, fuel: m.fuel, head: m.head, rise: m.rise, riseShort: m.riseShort,
    sydney: m.sydney?.mid ?? null, sydneyTone: m.sydney?.tone ?? 'flat', asOf: m.asOf, caption,
    rows: m.rows.slice(0, IOS_MAX_ROWS).map((r) => ({
      name: r.name, price: r.price, advice: r.stale ? r.note : r.advice, adviceTone: r.stale ? r.noteTone : r.adviceTone, fc: r.fc, fcTone: r.fcTone, url: r.uri,
    })),
    message: m.message,
    best: m.best ? { price: m.best.price, name: m.best.name, url: m.best.uri } : null,
    url: TODAY_URI,
  };
}

/** The instant a Sydney calendar day starts (DST-safe: Sydney is UTC+10 or UTC+11). */
export function sydneyMidnight(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  for (const off of [11, 10]) {
    const t = new Date(Date.UTC(y, m - 1, d) - off * 3600e3);
    if (sydneyToday(t) === day && sydneyToday(new Date(t.getTime() - 1)) !== day) return t;
  }
  return new Date(Date.UTC(y, m - 1, d) - 10 * 3600e3);
}

/**
 * Timeline entries: now, then each of the next `days` Sydney midnights with the model rebuilt for that day, so the
 * widget's day words and "as of" stay right while Bowser is closed. A week, because iOS may run the background task
 * rarely; the data itself only changes when the app or the background task pushes a new timeline.
 */
export function iosTimeline(
  snap: WidgetSnapshot | null, prefs: WidgetPrefs, pins: string[], now = new Date(), days = 7,
): { date: Date; props: IosWidgetProps }[] {
  const today = sydneyToday(now);
  const entries = [{ date: now, props: iosProps(buildModel(snap, prefs, pins, today, IOS_MAX_ROWS)) }];
  for (let k = 1; k <= days; k++) {
    const day = addDays(today, k);
    entries.push({ date: sydneyMidnight(day), props: iosProps(buildModel(snap, prefs, pins, day, IOS_MAX_ROWS)) });
  }
  return entries;
}
