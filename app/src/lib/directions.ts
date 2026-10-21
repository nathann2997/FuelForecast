// One-tap driving directions: Google Maps navigation on Android, Apple Maps on iOS, Google Maps on the web.
import { Linking, Platform } from 'react-native';

const google = (la: number, lo: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}&travelmode=driving`;

/** URLs to try, in order, for a platform. The last one always works (a web URL). */
export function directionsUrls(os: string, la: number, lo: number, label?: string): string[] {
  if (os === 'android') return [`google.navigation:q=${la},${lo}`, google(la, lo)];
  if (os === 'ios') {
    const q = label ? `&q=${encodeURIComponent(label)}` : '';
    return [`maps://?daddr=${la},${lo}&dirflg=d${q}`, google(la, lo)];
  }
  return [google(la, lo)];
}

/** Open driving directions to a point. Falls back to the Google Maps web URL if no maps app takes the link. */
export async function openDirections(la: number, lo: number, label?: string) {
  for (const url of directionsUrls(Platform.OS, la, lo, label)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // no app for this scheme: try the next URL
    }
  }
  return false;
}
