import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { RefreshControl as GHRefreshControl, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FUELS, fuelName, nice, sydneyToday } from '@/lib/format';
import type { Tone } from '@/lib/outlook';
import { setSettings, useSettings } from '@/lib/settings';

/** Background, text and accent colour for a decision tone */
export function toneColors(c: Palette, tone: Tone) {
  return tone === 'act'
    ? { bg: c.actBg, fg: c.actFg, strong: c.actStrong }
    : tone === 'wait'
      ? { bg: c.waitBg, fg: c.waitFg, strong: c.waitStrong }
      : { bg: c.calmBg, fg: c.calmFg, strong: c.calmStrong };
}

/** Scrolling screen with a title and the fuel chip (and the app wordmark above the title on Today). Android applies the bottom tab inset itself; we handle the top. */
export function Screen({
  title, subtitle, brand, children, onRefresh, refreshing = false, fuel = true, onBack, stack = !!onBack,
}: {
  title: string; subtitle?: string; brand?: ReactNode; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; fuel?: boolean;
  onBack?: () => void;
  /** A stack screen (no tab bar below): pad for the system navigation bar on Android too */
  stack?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  // Android SDK 58 is edge-to-edge, so the window no longer resizes for the keyboard: pad for it here.
  // Gesture-handler's ScrollView, not react-native's: the station rows' swipe (station-row.tsx) is a gesture-handler
  // pan, which a react-native ScrollView can't cancel, so a scroll that drifted sideways turned into a swipe mid-way.
  // This one takes part in gesture arbitration: once it starts scrolling, it cancels the rows' pending swipes.
  // Its RefreshControl must come from gesture-handler too.
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior="padding">
    <GHScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.four,
        paddingBottom: Spacing.six + (stack ? insets.bottom : Platform.OS === 'ios' ? insets.bottom + 50 : 0),
        paddingHorizontal: Spacing.four,
        gap: Spacing.four,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <GHRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          {onBack ? (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={styles.back}>
              <Text style={{ color: c.fg, fontSize: 26, lineHeight: 28 }}>‹</Text>
            </Pressable>
          ) : null}
          {brand ? <View style={{ marginBottom: Spacing.two }}>{brand}</View> : null}
          {subtitle ? <T kind="small">{subtitle}</T> : null}
          <T kind="title">{title}</T>
        </View>
        {fuel ? <FuelChip /> : null}
      </View>
      {children}
    </GHScrollView>
    </KeyboardAvoidingView>
  );
}

type Kind = 'title' | 'h2' | 'body' | 'small' | 'eyebrow' | 'num' | 'bignum' | 'hero';
export function T({ kind = 'body', color, style, ...rest }: TextProps & { kind?: Kind; color?: string }) {
  const c = useTheme();
  const tab = { fontVariant: ['tabular-nums'] };
  const base = {
    title: { fontSize: 28, fontWeight: '800', color: c.fg, letterSpacing: -0.5 },
    h2: { fontSize: 18, fontWeight: '700', color: c.fg, letterSpacing: -0.2 },
    body: { fontSize: 15, lineHeight: 22, color: c.fg2 },
    small: { fontSize: 13, lineHeight: 18, color: c.muted },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: c.muted },
    num: { ...tab, fontSize: 15, fontWeight: '600', color: c.fg },
    bignum: { ...tab, fontSize: 24, fontWeight: '800', color: c.fg, letterSpacing: -0.3 },
    hero: { ...tab, fontSize: 30, lineHeight: 36, fontWeight: '800', color: c.fg, letterSpacing: -0.6 },
  }[kind] as object;
  return <Text style={[base, color ? { color } : null, style]} {...rest} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function Section({
  title, action, children,
}: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.sectionHead}>
        <T kind="h2" style={{ flexShrink: 1 }}>{title}</T>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <T kind="small" color={c.tgp} style={{ fontWeight: '700' }}>{action.label}</T>
          </Pressable>
        ) : null}
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
    <View style={[styles.seg, { backgroundColor: c.sunk }]} accessibilityRole="radiogroup">
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 3, bottom: 3 }}   // with the control's 3 px padding: a 44 dp target
            style={[styles.segBtn, on && { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={{ color: on ? c.fg : c.muted, fontWeight: on ? '700' : '600', fontSize: 13 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Toggleable filter chip */
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      hitSlop={{ top: 4, bottom: 4 }}   // 36 dp chip, 44 dp target (chip rows have an 8 dp gap)
      style={[styles.chip, { borderColor: on ? c.fg : c.line, backgroundColor: on ? c.fg : c.surface }]}>
      <Text style={{ color: on ? c.bg : c.fg2, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Small filled label in a decision tone */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = useTheme();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{children}</Text>
    </View>
  );
}

export function Button({
  label, onPress, kind = 'primary', busy, disabled,
}: { label: string; onPress: () => void; kind?: 'primary' | 'secondary'; busy?: boolean; disabled?: boolean }) {
  const c = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? c.fg : c.surface, borderColor: primary ? c.fg : c.line, opacity: disabled ? 0.4 : pressed || busy ? 0.7 : 1 },
      ]}>
      <Text style={{ color: primary ? c.bg : c.fg, fontWeight: '700', fontSize: 15 }}>{busy ? 'Locating…' : label}</Text>
    </Pressable>
  );
}

/** Collapsible block for the "why" and the details most people skip */
export function Disclosure({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const c = useTheme();
  const [open, setOpen] = useState(initial);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line, padding: 0 }]}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.discHead}>
        <T style={{ fontWeight: '700', flex: 1 }} color={c.fg}>{title}</T>
        <T color={c.muted}>{open ? '−' : '+'}</T>
      </Pressable>
      {open ? <View style={{ paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.three }}>{children}</View> : null}
    </View>
  );
}

/** Bottom sheet over a scrim (the fuel picker, the station filters). Long content scrolls; `footer` stays pinned. */
export function Sheet({
  title, visible, onClose, children, footer, scroll = false,
}: { title: string; visible: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Edge-to-edge (SDK 58): the window doesn't resize for the keyboard, so lift the sheet above it (the fill and
          discount sheets have inputs and a Save button at the bottom) */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Pressable style={styles.scrim} onPress={onClose} accessible={false} importantForAccessibility="no">
        <Pressable
          style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: (footer ? Spacing.four : Spacing.six + Spacing.four) + insets.bottom }]}
          accessible={false}>
          <View style={styles.between}>
            <T kind="h2" style={{ flex: 1 }} accessibilityRole="header">{title}</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.close}>
              <T color={c.muted} style={{ fontSize: 20 }}>✕</T>
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: Spacing.five, paddingBottom: Spacing.two }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            children
          )}
          {footer}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** The fuel in use, shown on every screen; tap to switch */
export function FuelChip() {
  const c = useTheme();
  const { fuel } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Fuel: ${fuelName(fuel)}. Change fuel`}
        style={[styles.fuelChip, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={{ color: c.fg, fontWeight: '700', fontSize: 14 }}>{fuel === 'DL' ? 'Diesel' : fuel} ▾</Text>
      </Pressable>
      <Sheet title="Your fuel" visible={open} onClose={() => setOpen(false)}>
        <View style={{ gap: Spacing.two }}>
          {FUELS.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => { setSettings({ fuel: k }); setOpen(false); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: k === fuel }}
              style={[styles.option, { borderColor: k === fuel ? c.fg : c.line, backgroundColor: k === fuel ? c.sunk : c.surface }]}>
              <T style={{ fontWeight: '700', flex: 1 }} color={c.fg}>{label}</T>
              {k === fuel ? <T color={c.fg}>✓</T> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </>
  );
}

const FUEL_SHORT = [['U91', 'U91'], ['E10', 'E10'], ['P98', 'P98'], ['DL', 'Diesel']] as const;

/** The fuel picker as a segmented control, for the settings screen */
export function FuelPicker() {
  const { fuel } = useSettings();
  // Short names, as on the header chip: the full names wrapped "Diesel" onto a second row
  return <Segmented options={FUEL_SHORT} value={fuel} onChange={(f) => setSettings({ fuel: f })} />;
}

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
          <T color={c.tgp} style={{ fontWeight: '700' }}>Try again</T>
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
    <View style={[styles.banner, { backgroundColor: c.actBg }]}>
      <T kind="small" color={c.actFg}>
        Showing prices from {nice(asof)}. Today’s update hasn’t arrived yet.
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  back: { width: 44, height: 36, justifyContent: 'center', marginLeft: -Spacing.two, paddingLeft: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.card, padding: Spacing.four },
  seg: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: Radius.chip, padding: 3, gap: 2, alignSelf: 'flex-start' },
  segBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: Radius.chip, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  chip: { borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  badge: { borderRadius: Radius.chip, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
  button: { borderWidth: 1, borderRadius: Radius.input, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  discHead: { flexDirection: 'row', alignItems: 'center', padding: Spacing.four, gap: Spacing.two },
  fuelChip: { borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 2 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.five, gap: Spacing.four, maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing.three },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.input, padding: Spacing.four },
  banner: { borderRadius: Radius.input, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
});
