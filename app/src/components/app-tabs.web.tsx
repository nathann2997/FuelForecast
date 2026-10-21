// Browser preview only (the product is Android/iOS): a plain bottom tab bar in place of NativeTabs.
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const TABS = [
  ['index', '/', 'Today'],
  ['stations', '/stations', 'Stations'],
  ['more', '/more', 'More'],
] as const;

export default function AppTabs() {
  const c = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: c.bg, borderTopColor: c.line }]}>
        {TABS.map(([name, href, label]) => (
          <TabTrigger key={name} name={name} href={href} asChild>
            <TabButton>{label}</TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ref: _ref, ...props }: TabTriggerSlotProps) {
  const c = useTheme();
  return (
    <Pressable {...props} style={[styles.btn, isFocused && { backgroundColor: c.surface }]}>
      <Text style={{ color: isFocused ? c.fg : c.muted, fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingVertical: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
});
