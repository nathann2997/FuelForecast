// Android: the headless task the widget provider runs when a widget is added, resized, tapped on its mode row or
// fuel chip, deleted, or due for its periodic update (updatePeriodMillis in app.json). Imported from the app entry
// (index.ts) before expo-router.
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import type { Fuel } from '@/lib/types';

import { clearWidget, loadSnapshot, readCache, saveFuel, saveMode } from './data';
import { FUEL_ACTION, MODE_ACTION, parseFuel, parseMode, type StationMode } from './logic';
import { modelFor } from './model';
import { renderWidgetFor } from './widgets';

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) => {
  const id = widgetInfo.widgetId;
  if (widgetAction === 'WIDGET_DELETED') {
    await clearWidget(id);
    return;
  }
  let fetch = widgetAction !== 'WIDGET_RESIZED';   // a resize only re-lays out, so reuse what's cached
  const tapped: { mode?: StationMode; fuel?: Fuel } = {};
  if (widgetAction === 'WIDGET_CLICK') {
    // OPEN_URI taps (stations, the rest of the widget) open the app natively and never get here. The mode row sends
    // MODE { mode }; the fuel chip sends FUEL { fuel } (the next fuel in the cycle). Save it for this widget and
    // redraw from the cache so the switch is instant; fetch only when nothing is cached (a new or empty widget).
    const mode = clickAction === MODE_ACTION ? parseMode(clickActionData?.mode) : null;
    const fuel = clickAction === FUEL_ACTION ? parseFuel(clickActionData?.fuel) : null;
    if (mode) {
      tapped.mode = mode;
      await saveMode(id, mode);
    } else if (fuel) {
      tapped.fuel = fuel;
      await saveFuel(id, fuel);
    } else return;
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
    renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, modelFor(widgetInfo.widgetName, id, snap, tapped)));
  } catch (e) {
    console.error(`Bowser widget ${widgetInfo.widgetName} (${widgetAction}) failed to render`, e);   // adb logcat
    throw e;
  }
};

registerWidgetTaskHandler(widgetTaskHandler);
