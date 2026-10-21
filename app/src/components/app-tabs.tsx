import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const c = useTheme();
  return (
    <NativeTabs backgroundColor={c.bg} indicatorColor={c.surface} labelStyle={{ selected: { color: c.fg } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="fuelpump.fill" md="local_gas_station" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stations">
        <NativeTabs.Trigger.Label>Stations</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="location" md="near_me" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
