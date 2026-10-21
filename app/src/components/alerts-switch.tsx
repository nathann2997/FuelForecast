// The "tell me before prices rise" switch (More and the welcome screen). Turning it on asks for notification permission.
import { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setAlerts } from '@/lib/alerts';
import { useSettings } from '@/lib/settings';

export function AlertsSwitch() {
  const c = useTheme();
  const { alerts } = useSettings();
  const [busy, setBusy] = useState(false);
  if (Platform.OS === 'web') return null;
  const onChange = async (v: boolean) => {
    setBusy(true);
    const on = await setAlerts(v);
    setBusy(false);
    if (v && !on)
      Alert.alert('Notifications are off', 'Allow notifications for Bowser in Settings to get rise alerts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
  };
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <T color={c.fg}>Alert me before prices rise</T>
        <T kind="small">The morning before a likely jump</T>
      </View>
      <Switch value={alerts} disabled={busy} onValueChange={onChange} accessibilityLabel="Alert me before prices rise" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
