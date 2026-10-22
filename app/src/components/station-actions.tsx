// Shared bits for the station actions (pin and Map): the "pins full" message and how it's shown.
import { Alert, Platform, ToastAndroid } from 'react-native';

import { MAX_PINS } from '@/lib/pins';

export const PINS_FULL = `You can pin up to ${MAX_PINS} stations`;

/** A short message: a toast on Android, an alert elsewhere */
export function notify(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else if (Platform.OS === 'web') globalThis.alert?.(msg);
  else Alert.alert(msg);
}
