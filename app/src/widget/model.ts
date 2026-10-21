// Android only (imports the widget library via ./widgets). The model for one placed widget: the shared data and
// settings, the widget's own fuel (both sizes) and list mode (medium), and where "near" is (its live fix or the
// saved area).
import { sydneyToday } from '@/lib/format';
import type { Fuel } from '@/lib/types';

import { readFix, readFuel, readMode, readPins, readPrefs } from './data';
import { MAX_ROWS, buildModel, resolveFuel, resolveMode, resolveOrigin, type StationMode, type WidgetModel, type WidgetSnapshot } from './logic';
import { MEDIUM } from './widgets';

/**
 * `tapped` overrides the saved choice: a tap draws the tapped mode or fuel even if saving it failed.
 * `loc.bgGranted`: background location permission (location.ts prepareLocation), which lets the widget use its fix.
 */
export function modelFor(
  widgetName: string, widgetId: number, snap: WidgetSnapshot | null, tapped: { mode?: StationMode; fuel?: Fuel } = {},
  loc: { bgGranted: boolean; now?: number } = { bgGranted: false },
): WidgetModel {
  const pins = readPins();
  const settings = readPrefs();
  const { origin } = resolveOrigin(settings.home, loc.bgGranted, readFix(), loc.now ?? Date.now());
  const prefs = { ...settings, home: origin, fuel: resolveFuel(tapped.fuel ?? readFuel(widgetId), settings.fuel) };
  const mode = widgetName === MEDIUM ? resolveMode(tapped.mode ?? readMode(widgetId), snap, prefs, pins) : undefined;
  return buildModel(snap, prefs, pins, sydneyToday(), MAX_ROWS, mode);
}
