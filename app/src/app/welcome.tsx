// First run: fuel, area, rise alerts and the widget, on one screen. Shown once (settings.onboarded); Skip or Start
// both mark it seen. Saved settings from before 0.5.0 with an area count as seen (lib/settings.ts normalize).
import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { AlertsSwitch } from '@/components/alerts-switch';
import { AreaPicker } from '@/components/area-picker';
import { BowserWordmark } from '@/components/brand';
import { Button, Card, FuelPicker, Loading, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStations } from '@/lib/api';
import { setSettings, useSettings } from '@/lib/settings';

const done = () => {
  setSettings({ onboarded: true });
  router.replace('/');
};

export default function Welcome() {
  const c = useTheme();
  const s = useSettings();
  const sq = useStations();
  return (
    <Screen brand={<BowserWordmark height={28} />} title="When to fill up, and where" fuel={false} stack>
      <T>Sydney fuel prices rise and fall in a cycle. Bowser tells you which way they’re heading.</T>

      <Step n={1} title="Your fuel">
        <FuelPicker />
      </Step>

      <Step n={2} title="Where you fill up">
        {s.home ? (
          <View style={styles.between}>
            <T color={c.fg} style={{ flex: 1, fontWeight: '700' }}>{s.home.gps ? 'Your location' : s.home.label}</T>
            <T color={c.cheap} style={{ fontWeight: '700' }}>✓</T>
          </View>
        ) : sq.data ? (
          <AreaPicker suburbs={sq.data.suburbs} />
        ) : (
          <Loading error={sq.error} onRetry={() => sq.refetch()} />
        )}
      </Step>

      {Platform.OS !== 'web' ? (
        <Step n={3} title="Stay ahead">
          <AlertsSwitch />
          <T kind="small">
            {Platform.OS === 'ios'
              ? 'Tip: add the Bowser widget. Touch and hold your Home Screen, tap Edit, then Add Widget.'
              : 'Tip: add the Bowser widget. Long-press your home screen, then Widgets.'}
          </T>
        </Step>
      ) : null}

      <Button label="Start" onPress={done} />
      <Button label="Skip for now" kind="secondary" onPress={done} />
    </Screen>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const c = useTheme();
  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.between}>
        <View style={[styles.num, { backgroundColor: c.chip }]}>
          <T style={{ fontWeight: '800', fontSize: 13 }} color={c.onChip}>{n}</T>
        </View>
        <T kind="h2" style={{ flex: 1 }}>{title}</T>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
