import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, FuelPicker, Loading, Pill, Screen, Section, StaleBanner, T, arrow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useForecast, useHistory } from '@/lib/api';
import { horizons, jumpRisk, signalWhy } from '@/lib/copy';
import { fmt, fuelName, nice } from '@/lib/format';
import { useSettings } from '@/lib/settings';

export default function Today() {
  const c = useTheme();
  const { fuel } = useSettings();
  const fq = useForecast();
  const hq = useHistory();   // only for the 4-week wholesale move in the "why" text
  const f = fq.data;
  const r = f?.live.find((x) => x.fuel === fuel);

  return (
    <Screen
      title="Fill up now, or wait?"
      eyebrow="Sydney pump price outlook"
      onRefresh={() => { fq.refetch(); hq.refetch(); }}
      refreshing={fq.isRefetching}>
      <FuelPicker />
      {!f || !r ? (
        <Loading error={fq.error} onRetry={() => fq.refetch()} />
      ) : (
        <>
          <StaleBanner asof={f.asof} />
          <View style={[styles.board, { backgroundColor: c.board, borderColor: c.line }]}>
            <T kind="eyebrow" color={c.boardMuted}>
              Sydney · {fuelName(fuel)} · {nice(f.ctx.asof)}
            </T>
            <View style={styles.row}>
              <T kind="bignum" color={c.digit} style={{ fontSize: 44 }}>{r.now.toFixed(1)}</T>
              <T kind="small" color={c.boardMuted} style={{ flexShrink: 1 }}>c/L median</T>
            </View>
            <T kind="title" color={c.boardFg} style={{ fontSize: 34 }}>{r.verdict.head}</T>
            <T color={c.boardFg} style={{ opacity: 0.85 }}>{signalWhy(r, f.stats, f.ctx, hq.data)}</T>
            <View style={styles.meta}>
              <T kind="small" color={c.boardMuted}>Cheapest 10%: <T kind="small" color={c.boardFg}>{r.p10.toFixed(1)}c</T></T>
              <T kind="small" color={c.boardMuted}>Wholesale: <T kind="small" color={c.boardFg}>{r.tgp.toFixed(1)}c</T></T>
              <T kind="small" color={c.boardMuted}>Chance of 5c+ jump in 7 days: <T kind="small" color={c.boardFg}>{Math.round(r.p_jump7 * 100)}%</T></T>
            </View>
          </View>

          <Section eyebrow="Forecast median price, c/L" title="Next 14 days">
            <View style={styles.grid}>
              {horizons(r).map((h) => (
                <Card key={h.label} style={styles.cell}>
                  <T kind="eyebrow">{h.label}</T>
                  <T kind="bignum">{h.value.toFixed(1)}</T>
                  <Pill cls={h.cls}>{arrow(h.cls)} {fmt(h.delta)}c</Pill>
                  <T kind="small">80% range {h.lo.toFixed(0)} to {h.hi.toFixed(0)}</T>
                </Card>
              ))}
              <JumpCell r={r} />
            </View>
            <T kind="small">80% ranges come from the past year of out-of-sample errors. Live model: {f.ctx.live_model}.</T>
          </Section>

          <Pressable onPress={() => router.navigate('/stations')} accessibilityRole="button">
            <Card style={[styles.row, { justifyContent: 'space-between' }]}>
              <T style={{ fontWeight: '700', flexShrink: 1 }} color={c.fg}>Cheapest {fuelName(fuel)} near you</T>
              <T color={c.retail} style={{ fontWeight: '700' }}>Stations →</T>
            </Card>
          </Pressable>
          <T kind="small">Forecasts are statistical estimates for planning, not financial advice.</T>
        </>
      )}
    </Screen>
  );
}

function JumpCell({ r }: { r: Parameters<typeof jumpRisk>[0] }) {
  const j = jumpRisk(r);
  return (
    <Card style={styles.cell}>
      <T kind="eyebrow">Jump risk, 7 days</T>
      <T kind="bignum">{j.pct}%</T>
      <Pill cls={j.cls}>{j.label}</Pill>
      <T kind="small">Chance the median rises 5c or more</T>
    </Card>
  );
}

const styles = StyleSheet.create({
  board: { borderRadius: 18, padding: Spacing.five, gap: Spacing.three, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexWrap: 'wrap' },
  meta: { gap: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { flexBasis: '45%', flexGrow: 1, minWidth: 0, gap: Spacing.one, padding: Spacing.three },
});
