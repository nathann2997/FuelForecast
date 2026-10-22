import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PriceChart } from '@/components/price-chart';
import { Button, Card, Disclosure, Loading, Screen, Section, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReady } from '@/lib/analytics';
import { useForecast, useHistory, useStations } from '@/lib/api';
import { chartData, RANGES, type RangeKey } from '@/lib/chart';
import { cycleSummary, historyNote, insights } from '@/lib/copy';
import { fuelName, refreshedText } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import type { Fuel, Stations } from '@/lib/types';

const RANGE_OPTS = RANGES.map(([k]) => [k, k] as const);
// insights() order: 0 cycle, 1 where we are now, 2 margin, 3 day of week, 4 shop around, 5 diesel, 6 E10/P98, 7 since 2019, 8 oil
const KEY = [1, 0, 4];
const BRANDS_SHOWN = 6;

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

export default function TrendsScreen() {
  const c = useTheme();
  const { fuel } = useSettings();
  const [range, setRange] = useState<RangeKey>('1Y');
  const [allBrands, setAllBrands] = useState(false);
  const hq = useHistory();
  const fq = useForecast();
  const sq = useStations();
  useReady(!hq.isPending && !fq.isPending);
  const f = fq.data, h = hq.data;
  const r = f?.live.find((x) => x.fuel === fuel);
  const d = useMemo(() => (h && r && f ? chartData(h, r, f.ctx, fuel, range) : null), [h, r, f, fuel, range]);
  const brands = useMemo(() => (sq.data && r ? brandStats(sq.data, fuel, r.now) : []), [sq.data, fuel, r]);
  const maxAbs = Math.max(1, ...brands.map((b) => Math.abs(b.prem)));
  const all = f ? insights(f) : [];
  const where = f ? cycleSummary(f) : '';

  return (
    <Screen
      title="Trends"
      subtitle={`Sydney ${fuelName(fuel)}${f?.generated_at ? ` · ${refreshedText(f.generated_at)}` : ''}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => { hq.refetch(); fq.refetch(); sq.refetch(); }}
      refreshing={hq.isRefetching}>
      {!d || !f ? (
        <Loading error={hq.error ?? fq.error} onRetry={() => { hq.refetch(); fq.refetch(); }} />
      ) : (
        <>
          {where ? <T kind="h2" style={{ lineHeight: 24 }}>{where}</T> : null}

          <Card style={{ gap: Spacing.three }}>
            <Segmented options={RANGE_OPTS} value={range} onChange={setRange} />
            <PriceChart d={d} label={fuelName(fuel)} />
          </Card>

          <Section title="Know the cycle">
            <View style={{ gap: Spacing.two }}>
              {KEY.map((k) => all[k]).map((x) => (
                <Card key={x.title} style={styles.insight}>
                  <T kind="eyebrow">{x.title}</T>
                  <T kind="bignum">{x.big}</T>
                  <T kind="small" color={c.fg2}>{x.body}</T>
                </Card>
              ))}
            </View>
          </Section>

          {brands.length ? (
            <Section title="Cheapest brands today">
              <Card style={{ gap: 8 }}>
                {(allBrands ? brands : brands.slice(0, BRANDS_SHOWN)).map((b) => (
                  <View key={b.brand} style={styles.brandRow}>
                    <T kind="small" color={c.fg2} style={{ width: 112 }} numberOfLines={1}>{b.brand}</T>
                    <View style={styles.track}>
                      <View style={[styles.mid, { backgroundColor: c.line }]} />
                      <View
                        style={{
                          position: 'absolute', height: 8, borderRadius: 4, top: 4,
                          backgroundColor: b.prem < 0 ? c.cheap : c.dear,
                          width: `${(Math.abs(b.prem) / maxAbs) * 50}%`,
                          ...(b.prem < 0 ? { right: '50%' } : { left: '50%' }),
                        }}
                      />
                    </View>
                    <T kind="num" style={{ width: 50, textAlign: 'right', fontSize: 13 }}>
                      {b.prem < 0 ? '−' : '+'}{Math.abs(b.prem).toFixed(1)}c
                    </T>
                  </View>
                ))}
              </Card>
              {brands.length > BRANDS_SHOWN ? (
                <Button label={allBrands ? 'Show fewer' : `Show all ${brands.length} brands`} kind="secondary" onPress={() => setAllBrands(!allBrands)} />
              ) : null}
              <T kind="small">
                Average vs the Sydney median ({r!.now.toFixed(1)}c). Brands with 3+ stations.
                {brands.some((b) => b.brand === 'Costco') ? ' Costco is members-only.' : ''}
              </T>
            </Section>
          ) : null}

          <Disclosure title="More facts">
            {all.filter((_, i) => !KEY.includes(i)).map((x) => (
              <View key={x.title} style={{ gap: 2 }}>
                <View style={styles.factHead}>
                  <T kind="eyebrow" style={{ flex: 1 }}>{x.title}</T>
                  <T kind="num" style={{ fontSize: 14 }}>{x.big}</T>
                </View>
                <T kind="small" color={c.fg2}>{x.body}</T>
              </View>
            ))}
          </Disclosure>

          <Disclosure title="About this chart">
            <T kind="small" color={c.fg2}>
              Sydney median vs the wholesale price. The band spans the cheapest to dearest 10% of stations; the dashed line is the forecast. Drag to read any day.
            </T>
            {historyNote(f.ctx) ? <T kind="small">{historyNote(f.ctx)}</T> : null}
          </Disclosure>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  insight: { gap: 4, padding: Spacing.four },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { flex: 1, height: 16, justifyContent: 'center' },
  mid: { position: 'absolute', left: '50%', width: 1, height: 16 },
  factHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
});
