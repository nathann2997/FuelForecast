import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FUELS, nice, sydneyToday } from '@/lib/format';
import { setSettings, useSettings } from '@/lib/settings';
import type { VerdictCls } from '@/lib/types';

/** Scrolling screen with a title. Android applies the bottom tab inset itself; we handle the top. */
export function Screen({
  title, eyebrow, children, onRefresh, refreshing = false,
}: { title: string; eyebrow?: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.four,
        paddingBottom: Spacing.six + (Platform.OS === 'ios' ? insets.bottom + 50 : 0),
        paddingHorizontal: Spacing.four,
        gap: Spacing.four,
      }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined}>
      <View style={{ gap: 2 }}>
        {eyebrow ? <T kind="eyebrow">{eyebrow}</T> : null}
        <T kind="title">{title}</T>
      </View>
      {children}
    </ScrollView>
  );
}

type Kind = 'title' | 'h2' | 'body' | 'small' | 'eyebrow' | 'num' | 'bignum';
export function T({ kind = 'body', color, style, ...rest }: TextProps & { kind?: Kind; color?: string }) {
  const c = useTheme();
  const base = {
    title: { fontSize: 30, fontWeight: '800', color: c.fg, letterSpacing: -0.5 },
    h2: { fontSize: 20, fontWeight: '700', color: c.fg },
    body: { fontSize: 15, lineHeight: 22, color: c.fg2 },
    small: { fontSize: 13, lineHeight: 18, color: c.muted },
    eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: c.muted },
    num: { fontFamily: Fonts.mono, fontSize: 15, color: c.fg },
    bignum: { fontFamily: Fonts.mono, fontSize: 26, fontWeight: '700', color: c.fg },
  }[kind] as object;
  return <Text style={[base, color ? { color } : null, style]} {...rest} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function Section({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.three }}>
      <View style={{ gap: 2 }}>
        {eyebrow ? <T kind="eyebrow">{eyebrow}</T> : null}
        <T kind="h2">{title}</T>
      </View>
      {children}
    </View>
  );
}

export function Segmented<K extends string>({
  options, value, onChange,
}: { options: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.seg, { borderColor: c.line, backgroundColor: c.surface }]} accessibilityRole="radiogroup">
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.segBtn, on && { backgroundColor: c.fg }]}>
            <Text style={{ color: on ? c.bg : c.fg2, fontWeight: '600', fontSize: 13 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The fuel picker shared by every tab */
export function FuelPicker() {
  const { fuel } = useSettings();
  return <Segmented options={FUELS} value={fuel} onChange={(f) => setSettings({ fuel: f })} />;
}

export function Pill({ cls, children }: { cls: VerdictCls; children: ReactNode }) {
  const c = useTheme();
  const col = c[cls];
  return (
    <View style={[styles.pill, { borderColor: col }]}>
      <Text style={{ color: col, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export const arrow = (cls: VerdictCls) => (cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■');

/** Loading / error placeholder while a query has no data yet */
export function Loading({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const c = useTheme();
  if (!error) return <ActivityIndicator style={{ marginTop: Spacing.six }} color={c.muted} />;
  return (
    <Card style={{ gap: Spacing.two }}>
      <T kind="h2">Couldn’t load prices</T>
      <T>{error instanceof Error ? error.message : String(error)}</T>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <T color={c.retail} style={{ fontWeight: '700' }}>Try again</T>
        </Pressable>
      ) : null}
    </Card>
  );
}

/** Banner when the data on screen isn't today's (offline cache, or the daily run hasn't landed yet) */
export function StaleBanner({ asof }: { asof: string | undefined }) {
  const c = useTheme();
  if (!asof || asof === sydneyToday()) return null;
  return (
    <View style={[styles.card, { borderColor: c.chip, backgroundColor: c.surface, paddingVertical: Spacing.three }]}>
      <T kind="small" color={c.fg2}>
        Showing prices from {nice(asof)}. Today’s update hasn’t arrived yet; pull down to refresh.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.four },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderRadius: 999, padding: 3, gap: 2, alignSelf: 'flex-start' },
  segBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
});
