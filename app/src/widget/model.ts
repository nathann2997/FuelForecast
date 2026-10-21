// Android only (imports the widget library via ./widgets). The model for one placed widget: the shared data and
// settings, plus the medium widget's own list mode.
import { sydneyToday } from '@/lib/format';

import { readMode, readPins, readPrefs } from './data';
import { MAX_ROWS, buildModel, resolveMode, type StationMode, type WidgetModel, type WidgetSnapshot } from './logic';
import { MEDIUM } from './widgets';

/** `mode` overrides the saved one: a mode-row tap draws the tapped mode even if saving it failed. */
export function modelFor(widgetName: string, widgetId: number, snap: WidgetSnapshot | null, mode?: StationMode): WidgetModel {
  const pins = readPins();
  const prefs = readPrefs();
  const m = widgetName === MEDIUM ? resolveMode(mode ?? readMode(widgetId), snap, prefs, pins) : undefined;
  return buildModel(snap, prefs, pins, sydneyToday(), MAX_ROWS, m);
}
