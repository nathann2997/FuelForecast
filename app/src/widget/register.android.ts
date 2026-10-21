// Android: the headless task the widget provider runs when a widget is added, resized or due for its periodic
// update (updatePeriodMillis in app.json). Imported from the app entry (index.ts) before expo-router.
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { sydneyToday } from '@/lib/format';

import { loadSnapshot, readCache, readPins, readPrefs } from './data';
import { buildModel } from './logic';
import { renderWidgetFor } from './widgets';

registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, renderWidget }) => {
  // Taps are handled natively (OPEN_URI deep links); deleting needs no cleanup.
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  let snap = null;
  try {
    // A resize only re-lays out, so reuse what's cached; added/periodic updates may fetch.
    snap = await loadSnapshot({ allowFetch: widgetAction !== 'WIDGET_RESIZED' });
  } catch {
    snap = readCache();
  }
  // Always draw: a null snapshot means nothing was ever loaded, so there is no earlier state to keep and the
  // "Open Bowser" prompt beats a transparent widget.
  try {
    const model = buildModel(snap, readPrefs(), readPins(), sydneyToday());
    renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, model));
  } catch (e) {
    console.error(`Bowser widget ${widgetInfo.widgetName} (${widgetAction}) failed to render`, e);   // adb logcat
    throw e;
  }
});
