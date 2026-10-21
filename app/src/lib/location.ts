import * as Location from 'expo-location';

import type { Place } from './geo';

/** Device position, or an Error with a message fit to show */
export async function locate(): Promise<Place> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission was not given. Search a suburb or postcode instead.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
  const pos =
    last ??
    (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('Location timed out. Try again, or search a suburb.')), 15000)),
    ]));
  return { label: 'your location', la: pos.coords.latitude, lo: pos.coords.longitude, gps: true };
}

/** A fresh fix without prompting, when permission was already given; null otherwise */
export async function quietLocate(): Promise<Place | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((ok) => setTimeout(() => ok(null), 10000)),
      ]));
    return pos ? { label: 'your location', la: pos.coords.latitude, lo: pos.coords.longitude, gps: true } : null;
  } catch {
    return null;
  }
}
