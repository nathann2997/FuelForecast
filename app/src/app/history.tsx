import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PriceChart } from '@/components/price-chart';
import { Card, FuelPicker, Loading, Screen, Section, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useForecast, useHistory, useStations } from '@/lib/api';
import { chartData, RANGES, type RangeKey } from '@/lib/chart';
import { historyNote, insights } from '@/lib/copy';
import { fmt, fuelName, nice } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import type { Fuel, Stations } from '@/lib/types';

const RANGE_OPTS = RANGES.map(([k]) => [k, k] as const);

/** Average price per brand minus the Sydney median, brands with 3+ stations (brandStats() on the dashboard) */
function brandStats(st: Stations, fuel: Fuel, median: number) {
  const by: Record<string, number[]> = {};
  for (const s of st.stations) {
    const p = s.p[fuel];
    if (p && p[0] != null) (by[s.b] ??= []).push(p[0]);
  }
  return Object.entries(by)
    .filter(([, a]) => a.length >= 3)
    .map(([brand, a]) => ({ brand, n: a.length, prem: a.reduce((x, y) => x + y, 0) / a.length - median }))
    .sort((a, b) => a.prem - b.prem);
}

export default function HistoryScreen() {
  const c = useTheme();
  const { fuel } = useSettings();
  const [range, setRange] = useState<RangeKey>('1Y');
  const hq = useHistory();
  const fq = useForecast();
  const sq = useStations();
  const f = fq.data, h = hq.data;
  const r = f?.live.find((x) => x.fuel === fuel);
  const d = useMemo(() => (h && r && f ? chartData(h, r, f.ctx, fuel, range) : null), [h, r, f, fuel, range]);
  const brands = useMemo(() => (sq.data && r ? brandStats(sq.data, fuel, r.now) : []), [sq.data, fuel, r]);
  const maxAbs = Math.max(1, ...brands.map((b) => Math.abs(b.prem)));

  return (
    <Screen title="Price history" eyebrow="Evidence" onRefresh={() => { hq.refetch(); fq.refetch(); sq.refetch(); }} refreshing={hq.isRefetching}>
      <FuelPicker />
      {!d || !f ? (
        <Loading error={hq.error ?? fq.error} onRetry={() => { hq.refetch(); fq.refetch(); }} />
      ) : (
        <>
          <Section title="Sydney pump price against wholesale">
            <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            <PriceChart d={d} label={fuelName(fuel)} />
            <T kind="small">{historyNote(f.ctx)}</T>
          </Section>

          <Section eyebrow="What the data says for Sydney drivers" title="Know the cycle, beat the bowser">
            <View style={{ gap: Spacing.two }}>
              {insights(f).map((x) => (
                <Card key={x.title} style={{ gap: 4, padding: Spacing.three }}>
                  <T kind="eyebrow">{x.title}</T>
                  <T kind="bignum" style={{ fontSize: 22 }}>{x.big}</T>
                  <T kind="small" color={c.fg2}>{x.body}</T>
                </Card>
              ))}
            </View>
          </Section>

          {brands.length ? (
            <Section eyebrow={`Sydney ${fuelName(fuel)}, ${nice(sq.data!.asof)}`} title="Brand premium vs the Sydney median">
              <View style={{ gap: 6 }}>
                {brands.map((b) => (
                  <View key={b.brand} style={styles.brandRow}>
                    <T kind="small" color={c.fg2} style={{ width: 118 }} numberOfLines={1}>{b.brand}</T>
                    <View style={styles.track}>
                      <View style={[styles.mid, { backgroundColor: c.line }]} />
                      <View
                        style={{
                          position: 'absolute', height: 10, borderRadius: 3, top: 3,
                          backgroundColor: b.prem < 0 ? c.cheap : c.dear,
                          width: `${(Math.abs(b.prem) / maxAbs) * 50}%`,
                          ...(b.prem < 0 ? { right: '50%' } : { left: '50%' }),
                        }}
                      />
                    </View>
                    <T kind="num" style={{ width: 52, textAlign: 'right', fontSize: 13 }}>{fmt(b.prem)}c</T>
                  </View>
                ))}
              </View>
              <T kind="small">
                Average price at each brand’s Sydney stations today minus the Sydney median ({r!.now.toFixed(1)}c). Brands with 3+ stations selling this fuel. Negative is cheaper.
                {sq.data!.stations.some((x) => x.b === 'Costco') ? ' Costco’s Sydney sites are members-only and only report E10 and Premium 98, so they appear for those fuels and not for U91 or diesel.' : ''}
              </T>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { flex: 1, height: 16, justifyContent: 'center' },
  mid: { position: 'absolute', left: '50%', width: 1, height: 16 },
});
