// iOS: push the Bowser widget's timeline (./ios-model.ts) to WidgetKit. See ./render.ts for the no-op on web and
// ./render.android.ts for Android; keep the exports in step.
import { reportError } from '@/lib/analytics';

import { iosTimeline } from './ios-model';
import BowserWidget from './ios-widget';
import { loadSnapshot, readPins, readPrefs } from './data';

const DEBOUNCE_MS = 500;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

/** Build and push the timeline now. `allowFetch` lets it fetch when the cache is stale (the background task does). */
export async function pushWidgetTimeline(opts: { allowFetch: boolean } = { allowFetch: true }) {
  const snap = await loadSnapshot(opts).catch(() => null);
  if (!snap) return null;   // nothing loaded yet: keep the "Open Bowser" placeholder
  // iOS has no background location for the widget, so "near" is always the saved area (GPS areas keep their fix)
  BowserWidget.updateTimeline(iosTimeline(snap, readPrefs(), readPins()));
  return snap;
}

/**
 * Redraw the iOS widget. Call it when pins, fuel or area change and when fresh data arrives.
 * Debounced and never throws.
 */
export function requestWidgetRefresh(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const run = (running ?? Promise.resolve()).then(() => pushWidgetTimeline()).then(() => {}).catch((e) => { console.error('Bowser widget refresh failed', e); reportError(e); });
    running = run;
  }, DEBOUNCE_MS);
}
