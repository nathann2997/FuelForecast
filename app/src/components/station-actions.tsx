// The pin toggle and the Directions button on a station row. Each has its own 44 dp tap target, separate from the row.
import { Alert, Platform, Pressable, StyleSheet, ToastAndroid } from 'react-native';

import { DirectionsIcon, PinIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { openDirections } from '@/lib/directions';
import { MAX_PINS, togglePin, usePins } from '@/lib/pins';

export const PINS_FULL = `You can pin up to ${MAX_PINS} stations`;

/** A short message: a toast on Android, an alert elsewhere */
export function notify(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else if (Platform.OS === 'web') globalThis.alert?.(msg);
  else Alert.alert(msg);
}

export function PinButton({ id, name }: { id: string; name: string }) {
  const c = useTheme();
  const on = usePins().includes(id);
  return (
    <Pressable
      onPress={() => { if (!togglePin(id)) notify(PINS_FULL); }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `Unpin ${name}` : `Pin ${name}`}
      style={({ pressed }) => [styles.btn, pressed && { backgroundColor: c.sunk }]}>
      <PinIcon filled={on} color={on ? c.fg : c.muted} size={20} />
    </Pressable>
  );
}

export function DirectionsButton({ la, lo, name }: { la: number; lo: number; name: string }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={() => openDirections(la, lo, name)}
      accessibilityRole="button"
      accessibilityLabel={`Directions to ${name}`}
      style={({ pressed }) => [styles.btn, pressed && { backgroundColor: c.sunk }]}>
      <DirectionsIcon color={c.tgp} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
