import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AreaPicker } from '@/components/area-picker';
import { OutlookChart } from '@/components/outlook-chart';
import { SavingsStrip, TrackStrip } from '@/components/proof-strip';
import { BowserWordmark } from '@/components/brand';
import { MissingPinItem, rowKey, STALE_DAYS, StationItem } from '@/components/station-row';
import { Card, Disclosure, Loading, Screen, Section, StaleBanner, T, toneColors } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useArea } from '@/hooks/use-area';
import { useTheme } from '@/hooks/use-theme';
import { useReady } from '@/lib/analytics';
import { useForecast, useHistory, useStations } from '@/lib/api';
import { horizons, jumpRisk, signalWhy } from '@/lib/copy';
import { fmt, nice, refreshedText } from '@/lib/format';
import { pinnedRows } from '@/lib/filters';
import { rankStations } from '@/lib/geo';
import { dayLabel, outlook, riseDay } from '@/lib/outlook';
import { usePins } from '@/lib/pins';
import { useSettings } from '@/lib/settings';

export default function Today() {
  const c = useTheme();
  const s = useSettings();
  const home = useArea();
  const pins = usePins();
  const fq = useForecast();
  const sq = useStations();
  const hq = useHistory();   // only for the 4-week wholesale move in the "why" text
  useReady(!fq.isPending);
  const f = fq.data;
  const r = f?.live.find((x) => x.fuel === s.fuel);
  const o = r && f ? outlook(r, f.asof, s.tankL) : null;
  const t = toneColors(c, o?.tone ?? 'calm');

  const best = useMemo(() => {
    if (!sq.data || !home) return [];
    return rankStations(sq.data.stations, s.fuel, { home, radiusKm: s.radiusKm, members: s.members, sort: 'price', discounts: s.discounts })
      .filter((x) => x.age == null || x.age <= STALE_DAYS)
      .slice(0, 3);
  }, [sq.data, home, s.fuel, s.radiusKm, s.members, s.discounts]);
  const mine = useMemo(
    () => (sq.data ? pinnedRows(sq.data.stations, s.fuel, pins, home, s.discounts) : []),
    [sq.data, s.fuel, pins, home, s.discounts],
  );

  if (!s.onboarded) return <Redirect href="/welcome" />;

  return (
    <Screen
      brand={<BowserWordmark height={25} />}
      title="Today"
      subtitle={f ? `Sydney · ${refreshedText(f.generated_at) || dayLabel(f.asof)}` : undefined}
      onRefresh={() => { fq.refetch(); sq.refetch(); hq.refetch(); }}
      refreshing={fq.isRefetching}>
      {!f || !r || !o ? (
        <Loading error={fq.error} onRetry={() => fq.refetch()} />
      ) : (
        <>
          <StaleBanner asof={f.asof} />

          <View style={[styles.hero, { backgroundColor: t.bg }]}>
            <T kind="small" color={t.fg} style={{ fontWeight: '600' }}>
              Sydney median {r.now.toFixed(1)}c/L
            </T>
            <T kind="hero" color={t.fg} style={{ fontSize: 34, lineHeight: 40 }}>{o.head}</T>
            {o.deadline ? <T color={t.fg} style={{ fontWeight: '700' }}>{o.deadline}</T> : null}
            <T color={t.fg} style={{ opacity: 0.9 }}>{o.detail}</T>
            <OutlookChart r={r} asof={f.asof} rise={riseDay(r)} tone={o.tone} />
            <View style={styles.horizons}>
              {horizons(r).map((h) => (
                <View key={h.label} style={styles.hcell}>
                  <T kind="eyebrow" color={t.fg} style={{ opacity: 0.75, fontSize: 10 }} numberOfLines={1}>{h.short}</T>
                  <T kind="num" color={t.fg}>{h.value.toFixed(1)}</T>
                  <T kind="small" color={t.fg} style={{ opacity: 0.8 }}>{fmt(h.delta)}c</T>
                </View>
              ))}
            </View>
          </View>

          <Section title="Your stations">
            {!pins.length ? (
              <Card style={{ gap: Spacing.one }}>
                <T color={c.fg}>Pin the stations you use and they’ll show here first.</T>
                <T kind="small">Swipe a station left, or tap Pin on its page.</T>
              </Card>
            ) : !sq.data ? (
              <Loading error={sq.error} onRetry={() => sq.refetch()} />
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {mine.map((p, i) =>
                  p.row ? (
                    <StationItem key={p.id} r={p.row} median={r.now} sydney={o.tone} last={i === mine.length - 1} />
                  ) : (
                    <MissingPinItem key={p.id} id={p.id} station={p.station} fuel={s.fuel} last={i === mine.length - 1} />
                  ),
                )}
              </Card>
            )}
          </Section>

          <Section
            title={home && !home.gps ? `Cheapest near ${home.label.replace(/\s\d{4}$/, '')}` : 'Cheapest near you'}   // the suburb without its postcode: one line
            action={home ? { label: 'See all →', onPress: () => router.navigate('/stations') } : undefined}>
            {!sq.data ? (
              <Loading error={sq.error} onRetry={() => sq.refetch()} />
            ) : !home ? (
              <Card style={{ gap: Spacing.three }}>
                <T color={c.fg2}>Where do you fill up?</T>
                <AreaPicker suburbs={sq.data.suburbs} />
              </Card>
            ) : best.length === 0 ? (
              <Card><T>No recent prices within {s.radiusKm} km.</T></Card>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {best.map((x, i) => (
                  <StationItem key={rowKey(x)} r={x} median={r.now} sydney={o.tone} last={i === best.length - 1} />
                ))}
              </Card>
            )}
          </Section>

          <SavingsStrip />

          <Disclosure title="Why we think this">
            <T>{signalWhy(r, f.stats, f.ctx, hq.data)}</T>
            <View style={{ gap: Spacing.one }}>
              <Fact k="Chance of a 5c+ jump this week" v={`${jumpRisk(r).pct}% (${jumpRisk(r).label.toLowerCase()})`} />
              <Fact k="Cheapest 10% of Sydney stations" v={`${r.p10.toFixed(1)}c`} />
              <Fact k="Wholesale price" v={`${r.tgp.toFixed(1)}c`} />
            </View>
            <T kind="small">The shaded band is the likely range.</T>
          </Disclosure>

          <Pressable onPress={() => router.push('/trends')} accessibilityRole="link" hitSlop={8}>
            <T color={c.tgp} style={{ fontWeight: '700' }}>Price trends and the cycle →</T>
          </Pressable>

          <TrackStrip />

          <T kind="small">{refreshedText(f.generated_at) || `Prices from ${nice(f.asof)}`}. New prices up to 5 times a day. Estimates, not financial advice.</T>
        </>
      )}
    </Screen>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  const c = useTheme();
  return (
    <View style={styles.fact}>
      <T kind="small" color={c.fg2} style={{ flex: 1 }}>{k}</T>
      <T kind="num" style={{ fontSize: 13 }}>{v}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: Spacing.five, gap: Spacing.two },
  horizons: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  hcell: { flex: 1, gap: 1 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
});
