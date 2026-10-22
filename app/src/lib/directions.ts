// Show a station on the map: a pin in the phone's maps app (Google Maps on Android, Apple Maps on iOS, Google Maps on
// the web), not turn-by-turn navigation. The maps app offers directions from the pin if the user wants them.
import { Linking, Platform } from 'react-native';

const google = (la: number, lo: number) => `https://www.google.com/maps/search/?api=1&query=${la},${lo}`;

/** URLs to try, in order, for a platform. The last one always works (a web URL). */
export function mapUrls(os: string, la: number, lo: number, label?: string): string[] {
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
      return true;
    } catch {
      // no app for this scheme: try the next URL
    }
  }
  return false;
}
