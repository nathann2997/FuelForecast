// Android: the headless task the widget provider runs when a widget is added, resized, tapped on its mode row or fuel
// chip, deleted, or due for its periodic update (updatePeriodMillis in app.json). Imported from the app entry
// (index.ts) before expo-router.
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget';

import { syncAlerts } from '@/lib/alerts';
import { reportError } from '@/lib/analytics';
import type { Fuel } from '@/lib/types';

import { clearWidget, loadSnapshot, readCache, saveFuel, saveMode } from './data';
import { FUEL_ACTION, MODE_ACTION, parseFuel, parseMode, type StationMode } from './logic';
import { prepareLocation } from './location';
import { modelFor } from './model';
import { renderWidgetFor } from './widgets';

/** The ⟳ button's click action before 0.6.0 (see the WIDGET_CLICK branch) */
const STALE_LOCATE_ACTION = 'LOCATE';

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) => {
  const id = widgetInfo.widgetId;
  if (widgetAction === 'WIDGET_DELETED') {
    await clearWidget(id);
    return;
  }
  let fetch = widgetAction !== 'WIDGET_RESIZED';   // a resize only re-lays out, so reuse what's cached
  const tapped: { mode?: StationMode; fuel?: Fuel } = {};
  let saving: Promise<void> | null = null;
  // Location: a last-known read on added/periodic updates (no GPS wake-up), nothing on resizes and taps
  let locate: { skip?: boolean } = { skip: widgetAction === 'WIDGET_RESIZED' };
  if (widgetAction === 'WIDGET_CLICK') {
    // OPEN_URI taps (stations, the rest of the widget) open the app natively and never get here. The mode row sends
    // MODE { mode }; the fuel chip sends FUEL { fuel } (the next fuel in the cycle). Save the choice for this widget
    // and redraw from the cache so the switch is quick; fetch only when nothing is cached. LOCATE comes from the ⟳
    // button removed in 0.6.0, still on a widget drawn by 0.5.0: a plain redraw (no location read), which removes it.
    // Anything else is ignored.
    const mode = clickAction === MODE_ACTION ? parseMode(clickActionData?.mode) : null;
    const fuel = clickAction === FUEL_ACTION ? parseFuel(clickActionData?.fuel) : null;
    if (mode) {
      tapped.mode = mode;
      saving = saveMode(id, mode);   // awaited after the redraw: the tap draws `tapped`, not the saved value
      locate = { skip: true };
    } else if (fuel) {
      tapped.fuel = fuel;
      saving = saveFuel(id, fuel);
      locate = { skip: true };
    } else if (clickAction === STALE_LOCATE_ACTION) {
      locate = { skip: true };
    } else return;
    fetch = false;
  }
  const load = (allowFetch: boolean) => loadSnapshot({ allowFetch }).catch(() => readCache());
  // Location and data don't depend on each other, so read them side by side
  const [loc, cached] = await Promise.all([
    prepareLocation(locate).catch(() => ({ bgGranted: false })),   // no location: the saved area is used
    load(fetch),
  ]);
  const snap = cached ?? (widgetAction === 'WIDGET_CLICK' ? await load(true) : null);   // a tap fetches only when nothing is cached
  // Always draw: a null snapshot means nothing was ever loaded, so there is no earlier state to keep and the
  // "Open Bowser" prompt beats a transparent widget.
  try {
    renderWidget(renderWidgetFor(widgetInfo.widgetName, widgetInfo, modelFor(widgetInfo.widgetName, id, snap, tapped, loc)));
  } catch (e) {
    console.error(`Bowser widget ${widgetInfo.widgetName} (${widgetAction}) failed to render`, e);   // adb logcat
    reportError(e);
    throw e;
  } finally {
    await saving;   // never rejects (saveKey swallows errors)
    // Periodic and first draws carry the day's data even when Bowser stays closed: keep the rise alert current
    if (widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_ADDED') await syncAlerts(snap?.forecast?.live, snap?.forecast?.asof);
  }
};

registerWidgetTaskHandler(widgetTaskHandler);
