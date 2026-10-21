import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AreaPicker } from '@/components/area-picker';
import { OutlookChart } from '@/components/outlook-chart';
import { BowserWordmark } from '@/components/brand';
import { PinIcon } from '@/components/icons';
import { MissingPinItem, rowKey, STALE_DAYS, StationItem } from '@/components/station-row';
import { Card, Disclosure, Loading, Screen, Section, StaleBanner, T, toneColors } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useArea } from '@/hooks/use-area';
import { useTheme } from '@/hooks/use-theme';
import { useForecast, useHistory, useStations } from '@/lib/api';
import { horizons, jumpRisk, signalWhy } from '@/lib/copy';
import { fmt, fuelName, nice } from '@/lib/format';
import { pinnedRows } from '@/lib/filters';
import { rankStations } from '@/lib/geo';
import { dayLabel, outlook, riseDay } from '@/lib/outlook';
import { MAX_PINS, usePins } from '@/lib/pins';
import { useSettings } from '@/lib/settings';

export default function Today() {
  const c = useTheme();
  const s = useSettings();
  const home = useArea();
  const pins = usePins();
  const fq = useForecast();
  const sq = useStations();
  const hq = useHistory();   // only for the 4-week wholesale move in the "why" text
  const f = fq.data;
  const r = f?.live.find((x) => x.fuel === s.fuel);
  const o = r && f ? outlook(r, f.asof, s.tankL) : null;
  const t = toneColors(c, o?.tone ?? 'calm');

  const best = useMemo(() => {
    if (!sq.data || !home) return [];
    return rankStations(sq.data.stations, s.fuel, { home, radiusKm: s.radiusKm, members: s.members, sort: 'price' })
      .filter((x) => x.age == null || x.age <= STALE_DAYS)
      .slice(0, 3);
  }, [sq.data, home, s.fuel, s.radiusKm, s.members]);
  const mine = useMemo(() => (sq.data ? pinnedRows(sq.data.stations, s.fuel, pins, home) : []), [sq.data, s.fuel, pins, home]);

  return (
    <Screen
      brand={<BowserWordmark height={22} />}
      title="Today"
      subtitle={f ? `Sydney ${fuelName(s.fuel)} · ${dayLabel(f.asof)}` : undefined}
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
                  <T kind="eyebrow" color={t.fg} style={{ opacity: 0.75, fontSize: 10 }}>{h.label.replace('In ', '')}</T>
                  <T kind="num" color={t.fg}>{h.value.toFixed(1)}</T>
                  <T kind="small" color={t.fg} style={{ opacity: 0.8 }}>{fmt(h.delta)}c</T>
                </View>
              ))}
            </View>
          </View>

          <Section title="Your stations">
            {!pins.length ? (
              <View style={styles.hint}>
                <PinIcon size={16} color={c.muted} />
                <T kind="small" style={{ flex: 1 }}>Tap the pin on any station to keep it here, up to {MAX_PINS}.</T>
              </View>
            ) : !sq.data ? (
              <Loading error={sq.error} onRetry={() => sq.refetch()} />
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {mine.map((p, i) =>
                  p.row ? (
                    <StationItem key={p.id} r={p.row} median={r.now} last={i === mine.length - 1} />
                  ) : (
                    <MissingPinItem key={p.id} id={p.id} station={p.station} fuel={s.fuel} last={i === mine.length - 1} />
                  ),
                )}
              </Card>
            )}
          </Section>

          <Section
            title={home ? `Cheapest near ${home.gps ? 'you' : home.label}` : 'Cheapest near you'}
            action={home ? { label: 'See all →', onPress: () => router.navigate('/stations') } : undefined}>
            {!sq.data ? (
              <Loading error={sq.error} onRetry={() => sq.refetch()} />
            ) : !home ? (
              <Card style={{ gap: Spacing.three }}>
                <T color={c.fg2}>Set your area once to see the best {fuelName(s.fuel)} prices around you. It stays on your phone.</T>
                <AreaPicker suburbs={sq.data.suburbs} />
              </Card>
            ) : best.length === 0 ? (
              <Card><T>No up-to-date prices within {s.radiusKm} km. Widen the radius on the Stations tab.</T></Card>
            ) : (
              <>
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {best.map((x, i) => (
                    <StationItem key={rowKey(x)} r={x} median={r.now} last={i === best.length - 1} />
                  ))}
                </Card>
                {o.deadline ? (
                  <T kind="small">Station dates allow for how quickly each one usually follows a Sydney price jump. Tap one for its forecast.</T>
                ) : null}
              </>
            )}
          </Section>

          <Disclosure title="Why we think this">
            <T>{signalWhy(r, f.stats, f.ctx, hq.data)}</T>
            <View style={{ gap: Spacing.one }}>
              <Fact k="Chance of a 5c+ jump within 7 days" v={`${jumpRisk(r).pct}% (${jumpRisk(r).label.toLowerCase()})`} />
              <Fact k="Cheapest 10% of Sydney stations" v={`${r.p10.toFixed(1)}c`} />
              <Fact k="Wholesale (terminal gate) price" v={`${r.tgp.toFixed(1)}c`} />
            </View>
            <T kind="small">
              The shaded band on the chart is the 80% range, from the past year of out-of-sample errors. Live model: {f.ctx.live_model}.
            </T>
          </Disclosure>

          <T kind="small">
            Prices from {nice(f.asof)}, updated each morning. Forecasts are statistical estimates for planning, not financial advice.
          </T>
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
  hint: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
});
