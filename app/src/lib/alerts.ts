// Rise alerts: one local notification the morning before Sydney prices are likely to jump, for the user's fuel.
// Scheduled on the phone (no server, no push token) whenever fresh data arrives: from the app, and from the widget's
// periodic update so it still works while Bowser stays closed. Off until the user turns it on (More or the welcome).
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { addDays, fuelName } from './format';
import { dayLabel, riseDay, toneOf } from './outlook';
import { loadSettings, setSettings } from './settings';
import Storage from './storage';
import type { LiveRow } from './types';

const CHANNEL = 'rise';
const NOTE_ID = 'bowser-rise';
/** The alert last scheduled: `at` (ms) is when it shows; once that has passed it counts as sent */
const STATE_KEY = 'alerts.state';
export const ALERT_AT = { h: 7, m: 30 };
/** Latest local hour a widget update sends an alert straight away; later ones wait for the next morning */
const LATE_HOUR = 20;
/** At most one alert per price cycle: none for this long after one was sent (cycles run about 5 weeks) */
export const COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;

export type AlertPlan = { at: Date; title: string; body: string };

/** Is a rise worth an alert: the verdict says fill up, or a rise is likely within 2 days. The rise day moves with
 *  each day's forecast, so the alert keys on this condition, not on a date. */
export function alertWorthy(r: LiveRow | undefined): boolean {
  if (!r) return false;
  const J = riseDay(r);
  return J != null && (toneOf(r.verdict.cls) === 'act' || J <= 2);
}

/**
 * The alert for a forecast row, or null when there's nothing to say. It shows at the next 7:30 am; between 7:30 am
 * and 8 pm it shows a minute from now (`soon`, for the widget task), or next morning otherwise. Times are the
 * phone's local time, which for Bowser's Sydney users is Sydney time.
 */
export function alertPlan(r: LiveRow | undefined, asof: string, now: Date, soon = true): AlertPlan | null {
  if (!r || !alertWorthy(r)) return null;
  const rise = addDays(asof, riseDay(r)!);
  const morning = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ALERT_AT.h, ALERT_AT.m);
  const at = now < morning ? morning
    : soon && now.getHours() < LATE_HOUR ? new Date(now.getTime() + 60_000)
    : new Date(morning.getTime() + 24 * 60 * 60 * 1000);
  const when = dayLabel(rise);
  const act = toneOf(r.verdict.cls) === 'act';
  return {
    at,
    title: act ? `Fill up before ${when}` : `${fuelName(r.fuel)} may rise ${when}`,
    body: `Sydney ${fuelName(r.fuel)} ${act ? 'is likely to rise' : 'could start rising'} from ${when}. Open Bowser for the cheapest near you.`,
  };
}

type State = { at: number };
function readState(): State | null {
  try {
    const v = JSON.parse(Storage.getItemSync(STATE_KEY) ?? 'null');
    return v && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

async function cancel() {
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTE_ID);
  } catch {
    // nothing scheduled
  }
}

/** Cancel a pending alert and forget it (a sent one is kept, so its cooldown still applies) */
async function cancelPending(now: number) {
  const st = readState();
  await cancel();
  if (st && st.at > now) await Storage.removeItem(STATE_KEY).catch(() => {});
}

async function granted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Bring the alert in line with the latest forecast (`live` and `asof` from forecast.json). One alert per cycle:
 * scheduled when a rise becomes alert-worthy, cancelled if that changes before it shows, then nothing for
 * COOLDOWN_MS. `inApp`: the app is open and already showing the warning, so a rise found now counts as seen
 * instead of sending a notification a minute later. Reads the settings fresh (the widget task can run while the
 * app is closed); if notifications were blocked in system settings, alerts are switched off. Never throws.
 */
export async function syncAlerts(live: LiveRow[] | undefined, asof: string | undefined, opts: { now?: Date; inApp?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web' || !live || !asof) return;   // no data: leave things as they are
  const now = opts.now ?? new Date();
  const t = now.getTime();
  try {
    const s = loadSettings();
    if (!s.alerts) return void (await cancelPending(t));
    if (!(await granted())) {
      setSettings({ alerts: false });
      return void (await cancelPending(t));
    }
    const st = readState();
    if (st && st.at <= t && t - st.at < COOLDOWN_MS) return;   // sent (or seen) this cycle
    const r = live.find((x) => x.fuel === s.fuel);
    const plan = alertPlan(r, asof, now, !opts.inApp);
    if (!plan) return void (await cancelPending(t));
    if (opts.inApp && !(st && st.at > t)) {
      // The app is showing the warning right now: count it as seen
      await cancel();
      await Storage.setItem(STATE_KEY, JSON.stringify({ at: t }));
      return;
    }
    // Keep a pending alert's time (the condition still holds); refresh its text
    const at = st && st.at > t ? new Date(st.at) : plan.at;
    await cancel();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTE_ID,
      content: { title: plan.title, body: plan.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
    await Storage.setItem(STATE_KEY, JSON.stringify({ at: at.getTime() }));
  } catch (e) {
    console.warn('Bowser rise alert not scheduled', e);
  }
}

/** Turn alerts on (asks for notification permission) or off. Returns whether they are on afterwards. */
export async function setAlerts(on: boolean): Promise<boolean> {
  if (!on) {
    setSettings({ alerts: false });
    await cancel();
    await Storage.removeItem(STATE_KEY).catch(() => {});
    return false;
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Price rise alerts', importance: AndroidImportance.DEFAULT });
    }
    const cur = await Notifications.getPermissionsAsync();
    const ok = cur.granted || (cur.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    setSettings({ alerts: ok });
    return ok;
  } catch {
    setSettings({ alerts: false });
    return false;
  }
}

/** Show the alert as a banner even while Bowser is open. Call once from the root layout. */
export function initAlerts() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
