// Android: the headless task the widget provider runs when a widget is added, resized, tapped on its mode row, fuel
// chip or ⟳ button, deleted, or due for its periodic update (updatePeriodMillis in app.json). Imported from the app entry
// (index.ts) before expo-router.
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import type { Fuel } from '@/lib/types';

import { clearWidget, loadSnapshot, readCache, saveFuel, saveMode } from './data';
import { FUEL_ACTION, LOCATE_ACTION, MODE_ACTION, parseFuel, parseMode, type StationMode } from './logic';
import { prepareLocation } from './location';
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
  // Location: a last-known read on added/periodic updates (no GPS wake-up), a fresh fix on ⟳, nothing otherwise
  let locate: { fresh?: boolean; skip?: boolean } = { skip: widgetAction === 'WIDGET_RESIZED' };
  if (widgetAction === 'WIDGET_CLICK') {
    // OPEN_URI taps (stations, the rest of the widget) open the app natively and never get here. The mode row sends
    // MODE { mode }; the fuel chip sends FUEL { fuel } (the next fuel in the cycle); ⟳ sends LOCATE. Save the choice
    // for this widget and redraw from the cache so the switch is quick; fetch only when nothing is cached.
    const mode = clickAction === MODE_ACTION ? parseMode(clickActionData?.mode) : null;
    const fuel = clickAction === FUEL_ACTION ? parseFuel(clickActionData?.fuel) : null;
    if (mode) {
      tapped.mode = mode;
      await saveMode(id, mode);
      locate = { skip: true };
    } else if (fuel) {
      tapped.fuel = fuel;
      await saveFuel(id, fuel);
      locate = { skip: true };
    } else if (clickAction === LOCATE_ACTION) {
      locate = { fresh: true };
    } else return;
    fetch = readCache() == null;
  }
  let loc = { bgGranted: false };
  try {
    loc = await prepareLocation(locate);
  } catch {
    // no location: the saved area is used
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
    renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, modelFor(widgetInfo.widgetName, id, snap, tapped, loc)));
  } catch (e) {
    console.error(`Bowser widget ${widgetInfo.widgetName} (${widgetAction}) failed to render`, e);   // adb logcat
    throw e;
  }
};

registerWidgetTaskHandler(widgetTaskHandler);
