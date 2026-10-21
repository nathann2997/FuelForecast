// Android: the headless task the widget provider runs when a widget is added, resized, tapped on its mode row,
// deleted, or due for its periodic update (updatePeriodMillis in app.json). Imported from the app entry (index.ts)
// before expo-router.
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import { clearMode, loadSnapshot, readCache, saveMode } from './data';
import { MODE_ACTION, parseMode, type StationMode } from './logic';
import { modelFor } from './model';
import { renderWidgetFor } from './widgets';

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED') {
    await clearMode(widgetInfo.widgetId);
    return;
  }
  let fetch = widgetAction !== 'WIDGET_RESIZED';   // a resize only re-lays out, so reuse what's cached
  let mode: StationMode | undefined;
  if (widgetAction === 'WIDGET_CLICK') {
    // OPEN_URI taps (stations, the rest of the widget) open the app natively and never get here. The mode row
    // sends MODE with { mode }: save it for this widget and redraw it. Draw from the cache so the switch is
    // instant; fetch only when nothing is cached (a new or empty widget), so a tap can still recover it.
    const tapped = clickAction === MODE_ACTION ? parseMode(clickActionData?.mode) : null;
    if (!tapped) return;
    mode = tapped;
    await saveMode(widgetInfo.widgetId, tapped);
    fetch = readCache() == null;
  }
  let snap = null;
  try {
    snap = await loadSnapshot({ allowFetch: fetch });
  } catch {
    snap = readCache();
  }
  // Always draw: a null snapshot means nothing was ever loaded, so there is no earlier state to keep and the
  // "Open Bowser" prompt beats a transparent widget.
  try {
    renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, modelFor(widgetInfo.widgetName, widgetInfo.widgetId, snap, mode)));
  } catch (e) {
    console.error(`Bowser widget ${widgetInfo.widgetName} (${widgetAction}) failed to render`, e);   // adb logcat
    throw e;
  }
};

registerWidgetTaskHandler(widgetTaskHandler);
