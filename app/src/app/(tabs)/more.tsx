import Constants from 'expo-constants';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { BowserMark } from '@/components/brand';
import { AreaPicker } from '@/components/area-picker';
import { Button, Card, Disclosure, FuelPicker, Loading, Screen, Section, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DASHBOARD_URL, useForecast, useMeta, useStations } from '@/lib/api';
import { backtestNote, backtestRows, plainWarnings } from '@/lib/copy';
import { daysBetween, fuelName, nice } from '@/lib/format';
import { setSettings, useSettings } from '@/lib/settings';

const MODEL = [
  ['Target', 'Change in the Sydney median pump price over 1, 3, 7 and 14 days for U91, E10, Premium 98 and diesel, plus the chance of a 5c+ jump within 7 days.'],
  ['Inputs', 'Pump margin over the terminal gate price (TGP) and how it compares with the past year; wholesale moves over 1 to 28 days; Brent crude in Australian dollars and the AUD; how spread out station prices are and how many stations updated recently.'],
  ['Model', 'Gradient-boosted trees (LightGBM, Huber loss) pooled across the four fuels, with a separate classifier for price jumps.'],
  ['Validation', 'Walk-forward: retrained every month on all data before it, tested on each month from Jan 2021, including the 2022 and 2026 oil shocks. Ranges are 80% intervals from the past year of test errors.'],
  ['Limits', 'It reacts to oil and wholesale moves as they happen but cannot see wars, OPEC decisions or excise changes coming.'],
] as const;

const TANKS = [['40', '40 L'], ['50', '50 L'], ['60', '60 L'], ['70', '70 L'], ['80', '80 L']] as const;

export default function More() {
  const c = useTheme();
  const s = useSettings();
  const fq = useForecast();
  const mq = useMeta();
  const sq = useStations();
  const [editArea, setEditArea] = useState(false);
  const f = fq.data, m = mq.data;
  const week = f ? backtestRows(f, s.fuel).find((x) => x.horizon === '7 days') : undefined;

  return (
    <Screen title="More" subtitle="Settings and how it works" fuel={false} onRefresh={() => { fq.refetch(); mq.refetch(); }} refreshing={fq.isRefetching}>
      <Section title="Your car">
        <Card style={{ gap: Spacing.four }}>
          <Field label="Fuel"><FuelPicker /></Field>
          <Field label="Tank size, for savings in dollars">
            <Segmented
              options={TANKS}
              value={(TANKS.find(([k]) => Number(k) === s.tankL)?.[0] ?? '50') as (typeof TANKS)[number][0]}
              onChange={(k) => setSettings({ tankL: Number(k) })}
            />
          </Field>
          <Field label="Area">
            {editArea ? (
              sq.data ? (
                <View style={{ gap: Spacing.two }}>
                  <AreaPicker suburbs={sq.data.suburbs} onDone={() => setEditArea(false)} />
                  <Button label="Cancel" kind="secondary" onPress={() => setEditArea(false)} />
                </View>
              ) : (
                <Loading error={sq.error} onRetry={() => sq.refetch()} />
              )
            ) : (
              <View style={styles.between}>
                <T color={c.fg} style={{ flex: 1 }}>{s.home ? (s.home.gps ? 'Your location' : s.home.label) : 'Not set'}</T>
                <Pressable onPress={() => setEditArea(true)} accessibilityRole="button" hitSlop={8}>
                  <T color={c.tgp} style={{ fontWeight: '700' }}>{s.home ? 'Change' : 'Set'}</T>
                </Pressable>
                {s.home ? (
                  <Pressable onPress={() => setSettings({ home: null })} accessibilityRole="button" hitSlop={8}>
                    <T color={c.muted} style={{ fontWeight: '700' }}>Clear</T>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Field>
          <View style={styles.between}>
            <T color={c.fg} style={{ flex: 1 }}>Include members-only sites (Costco)</T>
            <Switch value={s.members} onValueChange={(v) => setSettings({ members: v })} />
          </View>
        </Card>
        <T kind="small">Settings and your area stay on this phone. Nothing is sent anywhere.</T>
      </Section>

      <Section title="How good is the forecast?">
        {!f || !week ? (
          <Loading error={fq.error} onRetry={() => fq.refetch()} />
        ) : (
          <>
            <T>
              In tests on every month since {f.bt.test_from.slice(0, 4)}, the 7-day forecast for {fuelName(s.fuel)} was off by {week.model.toFixed(1)}c on average, against {week.naive.toFixed(1)}c for assuming no change, and it called the direction right {week.dir}% of the time.
            </T>
            <Disclosure title="Accuracy by horizon">
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <Row cells={['Horizon', 'No change', 'Model', 'Gain', 'Direction']} head />
                {backtestRows(f, s.fuel).map((r) => (
                  <Row key={r.horizon} cells={[r.horizon, `${r.naive.toFixed(1)}c`, `${r.model.toFixed(1)}c`, `${r.gain}%`, `${r.dir}%`]} />
                ))}
              </Card>
              <T kind="small">{backtestNote(f, s.fuel)}</T>
            </Disclosure>
          </>
        )}
      </Section>

      <Disclosure title="How the model works">
        {MODEL.map(([k, v]) => (
          <T key={k} kind="small" color={c.fg2}><T kind="small" style={{ fontWeight: '700' }} color={c.fg}>{k}. </T>{v}</T>
        ))}
      </Disclosure>

      <Section title="Data freshness">
        {m ? (
          <Card style={{ gap: Spacing.two }}>
            <Fresh label="Live Sydney prices" date={m.asof} ok={1} today={m.asof} />
            <Fresh label="Wholesale TGP (AIP)" date={m.tgp_last} ok={5} today={m.asof} />
            <Fresh label="Brent and AUD (FRED)" date={m.fred_last} ok={10} today={m.asof} />
            <Fresh label="Full NSW price history" date={m.history_last} ok={60} today={m.asof} />
            <View style={styles.between}>
              <T kind="small">Daily snapshots stored</T>
              <T kind="num" style={{ fontSize: 13 }}>{m.snapshot_days ?? '–'}</T>
            </View>
            <T kind="small">Updated {new Date(m.generated_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}</T>
            {plainWarnings(m.warnings).map((w) => <T key={w} kind="small" color={c.up}>⚠ {w}</T>)}
          </Card>
        ) : (
          <Loading error={mq.error} onRetry={() => mq.refetch()} />
        )}
      </Section>

      <Section title="About">
        <View style={styles.about}>
          <BowserMark size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="h2">Bowser</T>
            <T kind="small">Version {Constants.expoConfig?.version ?? '–'}</T>
          </View>
        </View>
        <T kind="small">
          NSW Government FuelCheck API (live) and monthly price history on data.nsw.gov.au; Australian Institute of Petroleum terminal gate prices; Brent crude (DCOILBRENTEU) and AUD/USD (DEXUSAL) from FRED, Federal Reserve Bank of St. Louis. Prices in cents per litre including GST. Sydney is postcodes 2000–2234, 2555–2574 and 2740–2786.
        </T>
        <T kind="small">Forecasts are statistical estimates for planning, not financial advice.</T>
        <Pressable onPress={() => Linking.openURL(DASHBOARD_URL).catch(() => {})} accessibilityRole="link">
          <T color={c.tgp} style={{ fontWeight: '700' }}>Open the full web dashboard →</T>
        </Pressable>
      </Section>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <T kind="eyebrow">{label}</T>
      {children}
    </View>
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
    <View style={styles.between}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: good ? c.cheap : c.chip }} />
        <T kind="small" color={c.fg2}>{label}</T>
      </View>
      <T kind="num" style={{ fontSize: 13 }}>{date ? nice(date) : '–'}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  about: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.three },
});
