import Constants from 'expo-constants';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card, FuelPicker, Loading, Screen, Section, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DASHBOARD_URL, useForecast, useMeta } from '@/lib/api';
import { backtestNote, backtestRows } from '@/lib/copy';
import { daysBetween, nice } from '@/lib/format';
import { useSettings } from '@/lib/settings';

const MODEL = [
  ['Target', 'Change in the Sydney median pump price over 1, 3, 7 and 14 days for U91, E10, Premium 98 and diesel, plus the chance of a 5c+ jump within 7 days.'],
  ['Inputs', 'Pump margin over the terminal gate price (TGP) and how it compares with the past year; wholesale moves over 1 to 28 days; Brent crude in Australian dollars and the AUD; how spread out station prices are and how many stations updated recently.'],
  ['Model', 'Gradient-boosted trees (LightGBM, Huber loss) pooled across the four fuels, with a separate classifier for price jumps.'],
  ['Validation', 'Walk-forward: retrained every month on all data before it, tested on each month from Jan 2021, including the 2022 and 2026 oil shocks. Ranges are 80% intervals from the past year of test errors.'],
  ['Limits', 'It reacts to oil and wholesale moves as they happen but cannot see wars, OPEC decisions or excise changes coming.'],
] as const;

export default function About() {
  const c = useTheme();
  const { fuel } = useSettings();
  const fq = useForecast();
  const mq = useMeta();
  const f = fq.data, m = mq.data;

  return (
    <Screen title="How it works" eyebrow="Model card" onRefresh={() => { fq.refetch(); mq.refetch(); }} refreshing={fq.isRefetching}>
      <View style={{ gap: Spacing.three }}>
        {MODEL.map(([k, v]) => (
          <T key={k}><T style={{ fontWeight: '700' }} color={c.fg}>{k}. </T>{v}</T>
        ))}
      </View>

      <Section title="How good it is">
        <FuelPicker />
        {!f ? (
          <Loading error={fq.error} onRetry={() => fq.refetch()} />
        ) : (
          <>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <Row cells={['Horizon', 'No change', 'Model', 'Gain', 'Direction']} head />
              {backtestRows(f, fuel).map((r) => (
                <Row key={r.horizon} cells={[r.horizon, `${r.naive.toFixed(1)}c`, `${r.model.toFixed(1)}c`, `${r.gain}%`, `${r.dir}%`]} />
              ))}
            </Card>
            <T kind="small">{backtestNote(f, fuel)}</T>
          </>
        )}
      </Section>

      <Section eyebrow="Data freshness" title="What this was built from">
        {m ? (
          <Card style={{ gap: Spacing.two }}>
            <Fresh label="Live Sydney prices" date={m.asof} ok={1} today={m.asof} />
            <Fresh label="Wholesale TGP (AIP)" date={m.tgp_last} ok={5} today={m.asof} />
            <Fresh label="Brent and AUD (FRED)" date={m.fred_last} ok={10} today={m.asof} />
            <Fresh label="Full NSW price history" date={m.history_last} ok={60} today={m.asof} />
            <View style={styles.fresh}>
              <T kind="small">Daily snapshots stored</T>
              <T kind="num" style={{ fontSize: 13 }}>{m.snapshot_days ?? '–'}</T>
            </View>
            <T kind="small">Updated {new Date(m.generated_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</T>
            {m.warnings.map((w) => <T key={w} kind="small" color={c.up}>⚠ {w}</T>)}
          </Card>
        ) : (
          <Loading error={mq.error} onRetry={() => mq.refetch()} />
        )}
      </Section>

      <Section title="Sources">
        <T kind="small">
          NSW Government FuelCheck API (live) and monthly price history on data.nsw.gov.au; Australian Institute of Petroleum terminal gate prices; Brent crude (DCOILBRENTEU) and AUD/USD (DEXUSAL) from FRED, Federal Reserve Bank of St. Louis. Prices in cents per litre including GST. Sydney is postcodes 2000–2234, 2555–2574 and 2740–2786.
        </T>
        <T kind="small">Forecasts are statistical estimates for planning, not financial advice.</T>
        <Pressable onPress={() => Linking.openURL(DASHBOARD_URL).catch(() => {})} accessibilityRole="link">
          <T color={c.retail} style={{ fontWeight: '700' }}>Open the full web dashboard →</T>
        </Pressable>
        <T kind="small">App version {Constants.expoConfig?.version ?? '–'}</T>
      </Section>
    </Screen>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.tr, { borderBottomColor: c.line }]}>
      {cells.map((x, i) => (
        <T key={i} kind={head ? 'eyebrow' : 'num'} style={[{ flex: i === 0 ? 1.2 : 1, fontSize: head ? 10 : 13, textAlign: i === 0 ? 'left' : 'right' }]}>
          {x}
        </T>
      ))}
    </View>
  );
}

function Fresh({ label, date, ok, today }: { label: string; date: string | null; ok: number; today: string }) {
  const c = useTheme();
  const good = date != null && daysBetween(date, today) <= ok;
  return (
    <View style={styles.fresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: good ? c.cheap : c.chip }} />
        <T kind="small" color={c.fg2}>{label}</T>
      </View>
      <T kind="num" style={{ fontSize: 13 }}>{date ? nice(date) : '–'}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  fresh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
