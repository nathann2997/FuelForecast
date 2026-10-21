// Android only (imports the widget library via ./widgets). The model for one placed widget: the shared data and
// settings, plus the widget's own fuel (both sizes) and list mode (medium).
import { sydneyToday } from '@/lib/format';
import type { Fuel } from '@/lib/types';

import { readFuel, readMode, readPins, readPrefs } from './data';
import { MAX_ROWS, buildModel, resolveFuel, resolveMode, type StationMode, type WidgetModel, type WidgetSnapshot } from './logic';
import { MEDIUM } from './widgets';

/** `tapped` overrides the saved choice: a tap draws the tapped mode or fuel even if saving it failed. */
export function modelFor(
  widgetName: string, widgetId: number, snap: WidgetSnapshot | null, tapped: { mode?: StationMode; fuel?: Fuel } = {},
): WidgetModel {
  const pins = readPins();
  const settings = readPrefs();
  const prefs = { ...settings, fuel: resolveFuel(tapped.fuel ?? readFuel(widgetId), settings.fuel) };
  const mode = widgetName === MEDIUM ? resolveMode(tapped.mode ?? readMode(widgetId), snap, prefs, pins) : undefined;
  return buildModel(snap, prefs, pins, sydneyToday(), MAX_ROWS, mode);
}
