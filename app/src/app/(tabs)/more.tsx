import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { BowserMark } from '@/components/brand';
import { AlertsSwitch } from '@/components/alerts-switch';
import { AreaPicker } from '@/components/area-picker';
import { DiscountsEditor } from '@/components/discounts-editor';
import { Button, Card, Disclosure, FuelPicker, Loading, Screen, Section, Segmented, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track, useReady } from '@/lib/analytics';
import { useForecast, useMeta, useStations } from '@/lib/api';
import { backtestNote, backtestRows, plainWarnings, widgetLocationCopy } from '@/lib/copy';
import { daysBetween, nice, refreshedText } from '@/lib/format';
import { bgRequestOpensSettings, openLocationSettings, useBackgroundLocation } from '@/lib/location';
import { useFills } from '@/lib/fills';
import { setSettings, useSettings } from '@/lib/settings';

const MODEL = [
  ['What it predicts', 'How the Sydney median price of each fuel will move over the next 1, 3, 7 and 14 days, and the chance of a jump of 5c or more within a week.'],
  ['What it looks at', 'How far pump prices sit above the wholesale price compared with the past year, recent wholesale moves, the oil price in Australian dollars, and how spread out and how fresh station prices are.'],
  ['How it learns', 'A machine-learning model (gradient-boosted trees) trained on Sydney prices for all five fuels, with a separate model for price jumps.'],
  ['How it’s tested', 'Every month since Jan 2021 was forecast using only the data before it, including the 2022 and 2026 oil shocks. Across the fuels, the likely ranges covered about 8 in 10 of the past year’s outcomes.'],
  ['Limits', 'It reacts to oil and wholesale moves as they happen, but it can’t see wars, OPEC decisions or excise changes coming.'],
] as const;

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/3.0/au/';
const FUELCHECK_DATA = 'https://data.nsw.gov.au/data/dataset/fuel-check';

const TANKS = [['40', '40 L'], ['50', '50 L'], ['60', '60 L'], ['70', '70 L'], ['80', '80 L']] as const;

export default function More() {
  const c = useTheme();
  const s = useSettings();
  const fq = useForecast();
  const mq = useMeta();
  const sq = useStations();
  useReady(!fq.isPending);
  const fills = useFills();
  const [editArea, setEditArea] = useState(false);
  const f = fq.data, m = mq.data;
  const week = f ? backtestRows(f, s.fuel).find((x) => x.horizon === '7 days') : undefined;

  return (
    <Screen title="More" fuel={false} onRefresh={() => { fq.refetch(); mq.refetch(); }} refreshing={fq.isRefetching}>
      <Section title="Your car">
        <Card style={{ gap: Spacing.four }}>
          <Field label="Fuel"><FuelPicker /></Field>
          <Field label="Tank size">
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
                  <Pressable onPress={() => setSettings({ home: null })} accessibilityRole="button" accessibilityLabel="Clear area" hitSlop={8}>
                    <T color={c.muted} style={{ fontWeight: '700' }}>Clear</T>
                  </Pressable>
                ) : null}
              </View>
            )}
          </Field>
          <Field label="Discounts">
            <DiscountsEditor stations={sq.data?.stations} />
          </Field>
          <View style={styles.between}>
            <T color={c.fg} style={{ flex: 1 }}>Show members-only sites (Costco)</T>
            <Switch value={s.members} onValueChange={(v) => setSettings({ members: v })} />
          </View>
          <AlertsSwitch />
        </Card>
        <T kind="small">Stored on this phone only.</T>
      </Section>

      <Pressable onPress={() => router.push('/savings')} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Card style={styles.between}>
          <View style={{ flex: 1, gap: 2 }}>
            <T color={c.fg} style={{ fontWeight: '700' }}>Your fills and savings</T>
            <T kind="small">{fills.length ? `${fills.length} fill${fills.length === 1 ? '' : 's'} logged` : 'Tap Filled up on a station to start'}</T>
          </View>
          <T color={c.muted} style={{ fontSize: 22 }}>›</T>
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/trends')} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Card style={styles.between}>
          <View style={{ flex: 1, gap: 2 }}>
            <T color={c.fg} style={{ fontWeight: '700' }}>Price trends</T>
            <T kind="small">History, the price cycle and the cheapest brands</T>
          </View>
          <T color={c.muted} style={{ fontSize: 22 }}>›</T>
        </Card>
      </Pressable>

      {Platform.OS === 'android' ? <WidgetLocation /> : null}

      <Section title="How good is the forecast?">
        {!f ? (
          <Loading error={fq.error} onRetry={() => fq.refetch()} />
        ) : (
          <>
            {week ? (
              <Card style={styles.stats}>
                <Stat big={`${week.model.toFixed(1)}c`} label="average miss, 7 days ahead" />
                <Stat big={`${week.dir}%`} label="right direction" />
                <Stat big={`${week.naive.toFixed(1)}c`} label="if you assumed no change" />
              </Card>
            ) : (
              // a fuel the published backtest doesn't cover yet (P95 until its first monthly run)
              <T kind="small">{backtestNote(f, s.fuel)}</T>
            )}
            <Pressable onPress={() => router.push('/track')} accessibilityRole="link" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
              <Card style={styles.between}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T color={c.fg} style={{ fontWeight: '700' }}>Track record</T>
                  <T kind="small">Each daily call and how it turned out</T>
                </View>
                <T color={c.muted} style={{ fontSize: 22 }}>›</T>
              </Card>
            </Pressable>
            {week ? <Disclosure title="Accuracy by days ahead">
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <Row cells={['Ahead', 'No change', 'Bowser', 'Better by', 'Direction']} head />
                {backtestRows(f, s.fuel).map((r) => (
                  <Row key={r.horizon} cells={[r.horizon, `${r.naive.toFixed(1)}c`, `${r.model.toFixed(1)}c`, r.gain > 0 ? `${r.gain}%` : 'none', `${r.dir}%`]} />
                ))}
              </Card>
              <T kind="small">{backtestNote(f, s.fuel)}</T>
            </Disclosure> : null}
          </>
        )}
      </Section>

      <Disclosure title="How the forecast works">
        {MODEL.map(([k, v]) => (
          <T key={k} kind="small" color={c.fg2}><T kind="small" style={{ fontWeight: '700' }} color={c.fg}>{k}: </T>{v}</T>
        ))}
      </Disclosure>

      {m && plainWarnings(m.warnings).length ? (
        <Card style={{ gap: Spacing.two }}>
          {plainWarnings(m.warnings).map((w) => <T key={w} kind="small" color={c.up}>⚠ {w}</T>)}
        </Card>
      ) : null}

      <Disclosure title="Data sources">
        {m ? (
          <View style={{ gap: Spacing.two }}>
            <Fresh label="Live Sydney prices" date={m.asof} ok={1} today={m.asof} />
            <Fresh label="Wholesale prices (AIP)" date={m.tgp_last} ok={5} today={m.asof} />
            <Fresh label="Oil and exchange rate (EIA, RBA)" date={m.fred_last} ok={10} today={m.asof} />
            <Fresh label="NSW monthly price history" date={m.history_last} ok={60} today={m.asof} />
            <View style={styles.between}>
              <T kind="small">Days of station prices saved</T>
              <T kind="num" style={{ fontSize: 13 }}>{m.snapshot_days ?? '–'}</T>
            </View>
            <T kind="small">{refreshedText(m.generated_at)}. New prices up to 5 times a day.</T>
          </View>
        ) : (
          <Loading error={mq.error} onRetry={() => mq.refetch()} />
        )}
        <T kind="small">
          Contains NSW Government FuelCheck data © State of New South Wales (NSW Fair Trading), licensed under CC BY-SA 3.0 AU; prices adapted and forecasts added by Bowser. Wholesale prices © Australian Institute of Petroleum. Brent crude: U.S. Energy Information Administration (Refinitiv). AUD/USD: Reserve Bank of Australia (WM/Reuters). Not endorsed by any of them. Cents per litre including GST. Sydney is postcodes 2000–2234, 2555–2574 and 2740–2786.
        </T>
        <Pressable onPress={() => Linking.openURL(CC_BY_SA).catch(() => {})} accessibilityRole="link" hitSlop={8}>
          <T kind="small" color={c.tgp} style={{ fontWeight: '700' }}>Licence: CC BY-SA 3.0 AU</T>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(FUELCHECK_DATA).catch(() => {})} accessibilityRole="link" hitSlop={8}>
          <T kind="small" color={c.tgp} style={{ fontWeight: '700' }}>FuelCheck data on data.nsw.gov.au</T>
        </Pressable>
      </Disclosure>

      <Section title="About">
        <View style={styles.about}>
          <BowserMark size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <T kind="h2">Bowser</T>
            <VersionLine />
          </View>
        </View>
        <T kind="small">Forecasts are estimates for planning, not financial advice.</T>
        <View style={styles.between}>
          <T color={c.fg} style={{ flex: 1 }}>Share anonymous usage</T>
          <Switch value={s.analytics} onValueChange={(v) => setSettings({ analytics: v })} accessibilityLabel="Share anonymous usage and crash reports" />
        </View>
        <T kind="small">
          Usage and crash reports help find and fix problems. Usage is linked to this install, not to you, and goes to PostHog; crash
          reports go to Expo. They never include your location, your area or what you paid.
          {s.analytics ? '' : ' Usage sharing has stopped. Crash reports stop once Bowser has been fully closed and opened again.'}
        </T>
      </Section>
    </Screen>
  );
}

/** The version; tapping it 5 times marks this phone as a test phone (the owner's or a tester's), left out of the usage
 *  numbers in PostHog (`internal` on every event) */
function VersionLine() {
  const { internal } = useSettings();
  const [taps, setTaps] = useState<number[]>([]);
  const onPress = () => {
    const now = Date.now();
    const recent = [...taps.filter((t) => now - t < 3000), now];
    if (recent.length < 5) return setTaps(recent);
    setTaps([]);
    setSettings({ internal: !internal });
    track('analytics.internal', { on: !internal });
  };
  return (
    <Pressable onPress={onPress} accessible={false}>
      <T kind="small">Version {Constants.expoConfig?.version ?? '–'}{internal ? ' · test phone' : ''}</T>
    </Pressable>
  );
}

/** Android only: let the home-screen widget use the phone's position while Bowser is closed */
function WidgetLocation() {
  const c = useTheme();
  const { home } = useSettings();
  const bg = useBackgroundLocation();
  if (!bg.status || bg.status.status === 'unsupported') return null;
  const w = widgetLocationCopy(bg.status, home, bgRequestOpensSettings());
  const onPress = w.action === 'ask' ? bg.request : w.action === 'services' ? openLocationSettings : () => Linking.openSettings().catch(() => {});
  return (
    <Section title="Widget location">
      <Card style={{ gap: Spacing.three }}>
        <T>Let the widget show stations near you even when Bowser is closed. Your location stays on your phone.</T>
        <View style={styles.between}>
          <T color={c.fg2} style={{ flex: 1 }}>Status</T>
          <T color={w.status === 'On' ? c.cheap : c.fg} style={{ fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{w.status}</T>
        </View>
        {w.note ? <T kind="small">{w.note}</T> : null}
        {w.hint ? <T kind="small" color={c.fg2}>{w.hint}</T> : null}
        {w.action ? <Button label={w.action === 'ask' ? 'Allow all the time' : 'Open settings'} kind="secondary" onPress={onPress} /> : null}
      </Card>
    </Section>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T kind="num" color={c.fg} style={{ fontSize: 20 }}>{big}</T>
      <T kind="small">{label}</T>
    </View>
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
        <T kind="small" color={c.fg2} style={{ flexShrink: 1 }}>{label}</T>
      </View>
      <T kind="num" style={{ fontSize: 13 }}>{date ? nice(date) : '–'}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  about: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stats: { flexDirection: 'row', gap: Spacing.three },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.three },
});
