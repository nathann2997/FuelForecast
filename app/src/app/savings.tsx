// Your fills and what they saved: the total, where vs when, and each fill. Opened from Today (once you've logged a
// fill) and from More. Fills are logged from a station page ("Filled up"); everything stays on the phone.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { openStation } from '@/components/station-row';
import { Button, Card, Disclosure, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReady } from '@/lib/analytics';
import { useHistory } from '@/lib/api';
import { removeFill, useFills, type Fill } from '@/lib/fills';
import { nice } from '@/lib/format';
import { fillSaving, money, roundCents, summarise, WINDOW } from '@/lib/savings';
import { canShare, savingsMessage, shareText } from '@/lib/share';
import type { History } from '@/lib/types';

const SHORT = { U91: 'U91', E10: 'E10', P95: 'P95', P98: 'P98', DL: 'Diesel' } as const;

export default function Savings() {
  const c = useTheme();
  const fills = useFills();
  const hq = useHistory();
  useReady(!hq.isPending);
  const sum = useMemo(() => summarise(fills, hq.data), [fills, hq.data]);
  const brag = savingsMessage(sum);
  const tone = (v: number) => (roundCents(v) > 0 ? c.cheap : roundCents(v) < 0 ? c.dear : c.fg2);

  return (
    <Screen
      title="Your savings"
      fuel={false}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => hq.refetch()}
      refreshing={hq.isRefetching}>
      {!fills.length ? (
        <Card style={{ gap: Spacing.two }}>
          <T kind="h2">No fills yet</T>
          <T>After you fill up, open the station in Bowser and tap Filled up. Bowser works out what you saved against the Sydney median.</T>
        </Card>
      ) : (
        <>
          <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.line }]}>
            <T kind="eyebrow">{roundCents(sum.total) > 0 ? 'Saved with Bowser' : roundCents(sum.total) < 0 ? 'Against the Sydney median' : 'Your fills'}</T>
            <T kind="hero" color={tone(sum.total)} style={{ fontSize: 44, lineHeight: 50, letterSpacing: -1.2 }}>{money(sum.total)}</T>
            <T kind="small" color={c.fg2}>
              {sum.n} fill{sum.n === 1 ? '' : 's'} · {Math.round(sum.litres)} L{sum.since ? ` since ${nice(sum.since, false)}` : ''}
            </T>
            <View style={[styles.split, { borderTopColor: c.line }]}>
              <Part label="Where you filled" value={money(sum.where)} color={tone(sum.where)} sub="vs the Sydney median that day" />
              {sum.pending === sum.n ? (
                <Part label="When you filled" value="pending" color={c.muted} sub={`vs the ${WINDOW} days after`} last />
              ) : (
                <Part label="When you filled" value={money(sum.when)} color={tone(sum.when)} sub={`vs the ${WINDOW} days after`} last />
              )}
            </View>
            {sum.pending ? (
              <T kind="small">
                {sum.pending === sum.n ? 'Timing' : `Timing for ${sum.pending} fill${sum.pending === 1 ? '' : 's'}`} counts once the {WINDOW} days after have passed and their Sydney prices are published (NSW releases each month’s full history a few weeks late).
              </T>
            ) : null}
          </View>

          {brag && canShare() ? <Button label="Share my savings" kind="secondary" onPress={() => shareText(brag, 'savings')} /> : null}

          <Section title="Your fills">
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {fills.map((f, i) => (
                <FillRow key={f.id} f={f} h={hq.data} last={i === fills.length - 1} />
              ))}
            </Card>
          </Section>
        </>
      )}

      <Disclosure title="How savings are counted">
        <T kind="small" color={c.fg2}>
          Where you filled: the Sydney median for your fuel that day, less what you paid, times the litres.
        </T>
        <T kind="small" color={c.fg2}>
          When you filled: the average Sydney median over the {WINDOW} days after, less the median that day, times the litres. Filling before a rise counts as a saving; filling before a fall counts against you. It shows once at least 5 of those days are published, and can shift a little when NSW fills in the rest.
        </T>
        <T kind="small" color={c.fg2}>
          Together they compare you with paying a typical Sydney price at a typical time that week. The median is the middle price: half of Sydney’s stations charge less, half more. Your fills stay on this phone.
        </T>
      </Disclosure>
    </Screen>
  );
}

function Part({ label, value, sub, color, last }: { label: string; value: string; sub: string; color: string; last?: boolean }) {
  const c = useTheme();
  return (
    <View style={[{ flex: 1, gap: 2 }, !last && { borderRightColor: c.line, borderRightWidth: StyleSheet.hairlineWidth, paddingRight: Spacing.three }]}>
      <T kind="eyebrow" style={{ fontSize: 10 }}>{label}</T>
      <T kind="num" color={color} style={{ fontSize: 20 }}>{value}</T>
      <T kind="small" style={{ fontSize: 12 }}>{sub}</T>
    </View>
  );
}

function FillRow({ f, h, last }: { f: Fill; h: History | undefined; last: boolean }) {
  const c = useTheme();
  const [confirm, setConfirm] = useState(false);
  // An armed Remove disarms itself after a few seconds
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  const s = fillSaving(f, h);
  const color = s.total == null ? c.muted : roundCents(s.total) > 0 ? c.cheap : roundCents(s.total) < 0 ? c.dear : c.fg2;
  const line = `${nice(f.date, false)} · ${SHORT[f.fuel]} · ${f.litres} L at ${f.paid.toFixed(1)}`;
  return (
    <View style={[styles.row, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Pressable
        onPress={f.stationId ? () => openStation(f.stationId!) : undefined}
        disabled={!f.stationId}
        accessibilityRole={f.stationId ? 'button' : undefined}
        accessibilityLabel={`${f.name}, ${line}, ${s.total == null ? 'saving unknown' : money(s.total)}${s.pending ? ', timing still counting' : ''}`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <T color={c.fg} style={{ fontWeight: '700' }} numberOfLines={1}>{f.name}</T>
          <T kind="small" numberOfLines={1}>{line}</T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T kind="num" color={color}>{s.total == null ? '–' : money(s.total)}</T>
          {s.pending ? <T kind="small" style={{ fontSize: 11 }}>timing pending</T> : null}
        </View>
      </Pressable>
      {confirm ? (
        <Pressable
          onPress={() => removeFill(f.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove the fill at ${f.name} on ${nice(f.date)}`}
          style={[styles.confirm, { backgroundColor: c.dear }]}>
          <T kind="small" color={c.bg} style={{ fontWeight: '700' }}>Remove</T>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => setConfirm(true)}
          accessibilityRole="button"
          accessibilityLabel={`Remove this fill`}
          hitSlop={4}
          style={styles.remove}>
          <T color={c.muted} style={{ fontSize: 15 }}>✕</T>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: Spacing.five, gap: Spacing.two },
  split: { flexDirection: 'row', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingLeft: Spacing.four },
  remove: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  confirm: { minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.chip, justifyContent: 'center', marginHorizontal: Spacing.two },
});
