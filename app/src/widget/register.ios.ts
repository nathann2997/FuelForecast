// iOS: a background task that refreshes the widget and the rise alert while Bowser is closed (the Android widget does
// this from its own periodic update, see ./register.android.ts). iOS decides when it runs (BGTaskScheduler, usually a
// few times a day when the phone is idle); the interval below is only a minimum. Imported from the app entry
// (index.ts) so the task is defined before iOS wakes the app for it.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncAlerts } from '@/lib/alerts';
import { reportError } from '@/lib/analytics';

import { pushWidgetTimeline } from './render.ios';

export const REFRESH_TASK = 'bowser-refresh';
const MIN_INTERVAL_MIN = 4 * 60;   // same as the Android widget's updatePeriodMillis

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const snap = await pushWidgetTimeline({ allowFetch: true });
    await syncAlerts(snap?.forecast?.live, snap?.forecast?.asof);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('Bowser background refresh failed', e);
    reportError(e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Schedule the refresh once (it persists across launches). Skipped when Background App Refresh is off. */
async function schedule() {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(REFRESH_TASK)) return;
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: MIN_INTERVAL_MIN });
  } catch (e) {
    console.warn('Bowser background refresh not scheduled', e);
  }
}

schedule();
