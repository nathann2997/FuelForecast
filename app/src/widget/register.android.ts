// Android: the headless task the widget provider runs when a widget is added, resized or due for its periodic
// update (updatePeriodMillis in app.json). Imported from the app entry (index.ts) before expo-router.
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { sydneyToday } from '@/lib/format';

import { loadSnapshot, readPins, readPrefs } from './data';
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
    // fall through: render the prompt for a new widget, keep the last state otherwise
  }
  if (!snap && widgetAction === 'WIDGET_UPDATE') return;   // offline with nothing cached: keep the last rendered state
  const model = buildModel(snap, readPrefs(), readPins(), sydneyToday());
  renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, model));
});
