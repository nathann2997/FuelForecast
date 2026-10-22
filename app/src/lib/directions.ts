// Show a station on the map: a pin in the phone's maps app (Google Maps on Android, Apple Maps on iOS, Google Maps on
// the web), not turn-by-turn navigation. The maps app offers directions from the pin if the user wants them.
import { Linking, Platform } from 'react-native';

import { track } from './analytics';

const google = (la: number, lo: number) => `https://www.google.com/maps/search/?api=1&query=${la},${lo}`;

/** URLs to try, in order, for a platform; the last is a web URL that always opens. None if the coordinates aren't numbers. */
export function mapUrls(os: string, la: number, lo: number, label?: string): string[] {
  // Coordinates come from the API: only real numbers go into a URL
  if (!Number.isFinite(Number(la)) || !Number.isFinite(Number(lo))) return [];
  la = Number(la);
  lo = Number(lo);
  if (os === 'android') {
    // geo: opens the default maps app on a pin; "(label)" names it. Brackets in the name are encoded too
    // (encodeURIComponent leaves them), or "BP Mosman (9542)" would end the label early
    const name = label ? `(${encodeURIComponent(label).replace(/\(/g, '%28').replace(/\)/g, '%29')})` : '';
    return [`geo:0,0?q=${la},${lo}${name}`, google(la, lo)];
  }
  if (os === 'ios') {
    const q = label ? `&q=${encodeURIComponent(label)}` : '';
    return [`maps://?ll=${la},${lo}${q}`, google(la, lo)];
  }
  return [google(la, lo)];
}

/** Show a point on the map. Falls back to the Google Maps web URL if no maps app takes the link. */
export async function openInMaps(la: number, lo: number, label?: string) {
  for (const url of mapUrls(Platform.OS, la, lo, label)) {
    try {
      await Linking.openURL(url);
      track('directions.opened', { ok: true });
      return true;
    } catch {
      // no app for this scheme: try the next URL
    }
  }
  track('directions.opened', { ok: false }, 'warn');
  return false;
}
