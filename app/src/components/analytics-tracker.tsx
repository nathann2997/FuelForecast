// Product analytics plumbing for the root layout (lib/analytics.ts, docs/ANALYTICS_PLAN.md). Renders nothing.
// - starts PostHog while the app is in front (never from a background task) and keeps it in step with More → Share
//   anonymous usage
// - one app.opened each time the app comes to the front, with what brought it there: the widget or a shared link
//   (?src= on fuelforecast:// links), a rise alert, or the launcher
// - a screen view per route, by pattern
// - the Sydney verdict for your fuel on every event, so actions can be split by what Bowser was advising
import * as Notifications from 'expo-notifications';
import { useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import {
  clearOpenSource, hasOpenSource, linkSource, logOpen, noteOpenSource, routePattern, screen, setContext, setUsageSharing, startProductAnalytics,
} from '@/lib/analytics';
import { useForecast } from '@/lib/api';
import { lastResumeCheck, launchCheck } from '@/lib/ota';
import { outlook } from '@/lib/outlook';
import { getSettings, useSettings } from '@/lib/settings';
import Storage from '@/lib/storage';

const LAST_ALERT_KEY = 'analytics.lastAlert';
/** Coming back to the front sooner than this, without a link or alert, is the same visit */
const WARM_OPEN_MS = 60 * 1000;

/** A tapped rise alert, counted once: getLastNotificationResponseAsync returns the same response on later launches */
function alertOpen(r: Notifications.NotificationResponse | null) {
  if (!r) return;
  const key = `${r.notification.request.identifier}|${r.notification.date}`;
  try {
    if (Storage.getItemSync(LAST_ALERT_KEY) === key) return;
    Storage.setItemSync(LAST_ALERT_KEY, key);
  } catch {
    // count it: storage only prevents a repeat
  }
  noteOpenSource('alert');
}

export function AnalyticsTracker() {
  const segments = useSegments();
  const { fuel, tankL, analytics, view } = useSettings();
  const fq = useForecast();

  // Start in front; one open per time the app comes to the front
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let opened = false;   // the first time in front after this JS load is the cold open, whatever state it started in
    let awayAt: number | null = null;
    const sources = Promise.all([
      Linking.getInitialURL().then((u) => noteOpenSource(linkSource(u))).catch(() => {}),
      Notifications.getLastNotificationResponseAsync().then(alertOpen).catch(() => {}),
    ]);
    const front = () => {
      startProductAnalytics(getSettings().analytics);
      if (!opened) {
        opened = true;
        logOpen(true, sources, launchCheck());   // not counted if the launch check restarts into an update
        return;
      }
      // Back after a real absence, or via a link or alert. Android reports "background" for a permission dialog, the
      // share sheet or Maps opening on top: coming back from those isn't an open.
      const away = awayAt != null ? Date.now() - awayAt : 0;
      setTimeout(() => {   // a tap's url or alert response arrives just after
        if (away >= WARM_OPEN_MS || hasOpenSource()) logOpen(false, Promise.resolve(), lastResumeCheck());
      }, 700);
    };
    if (AppState.currentState === 'active') front();
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (!opened || awayAt != null) front();   // iOS inactive → active (control centre) is neither
        awayAt = null;
      } else if (next === 'background') {
        awayAt = Date.now();
        clearOpenSource();
      }
    });
    const urlSub = Linking.addEventListener('url', ({ url }) => noteOpenSource(linkSource(url)));
    const tapSub = Notifications.addNotificationResponseReceivedListener(alertOpen);
    return () => {
      appSub.remove();
      urlSub.remove();
      tapSub.remove();
    };
  }, []);

  // More → Share anonymous usage applies to PostHog straight away
  useEffect(() => setUsageSharing(analytics), [analytics]);

  // Stations says whether it's showing the list or the map (switching counts as a new view)
  const pattern = routePattern(segments);
  const stationsView = pattern === '/stations' ? view : null;
  useEffect(() => screen(pattern, stationsView ? { view: stationsView } : undefined), [pattern, stationsView]);

  // What Bowser is advising for your fuel right now: act (fill), wait, or calm (no rush)
  const r = fq.data?.live.find((x) => x.fuel === fuel);
  const verdict = r && fq.data ? outlook(r, fq.data.asof, tankL).tone : null;
  useEffect(() => {
    if (fq.data) setContext({ verdict: verdict ?? 'none' });   // 'none': no forecast for this fuel
  }, [verdict, fq.data]);

  return null;
}
