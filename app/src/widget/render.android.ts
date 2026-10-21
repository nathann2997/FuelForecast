// Android: draw both widgets from the best data available. See ./render.ts for the no-op on other platforms.
import { requestWidgetUpdate } from 'react-native-android-widget';

import { loadSnapshot } from './data';
import { prepareLocation } from './location';
import { modelFor } from './model';
import { WIDGET_NAMES, renderWidgetFor } from './widgets';

const DEBOUNCE_MS = 500;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

async function refreshNow() {
  const snap = await loadSnapshot({ allowFetch: true });
  if (!snap) return;   // nothing loaded yet: leave whatever the widget shows
  const loc = await prepareLocation().catch(() => ({ bgGranted: false }));   // last-known fix only
  for (const name of WIDGET_NAMES) {
    // Each placed widget gets its own model: the medium widget's list mode and fuel are saved per widget id
    await requestWidgetUpdate({ widgetName: name, renderWidget: (info) => renderWidgetFor(name, info, modelFor(name, info.widgetId, snap, {}, loc)) });
  }
}

/**
 * Redraw every placed Bowser widget. Call it when pins, fuel or area change and when fresh data arrives.
 * Debounced, never throws, and a no-op on web and iOS.
 */
export function requestWidgetRefresh(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const run = (running ?? Promise.resolve()).then(() => refreshNow()).catch((e) => console.error('Bowser widget refresh failed', e));
    running = run;
  }, DEBOUNCE_MS);
}
