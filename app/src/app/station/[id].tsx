// The station page ("ticker"): one station's price for a fuel, how it moved, its chart against the Sydney median
// with the 14-day forecast, what to do, and how the station tends to behave. Opened from a station row, a pinned
// station, or the widget via fuelforecast://station/<id>.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { FillSheet } from '@/components/fill-sheet';
import { MapPinIcon, PumpIcon } from '@/components/icons';
import { ADVICE_TONE } from '@/components/station-row';
import { TickerChart } from '@/components/ticker-chart';
import { Badge, Card, Section, StaleBanner, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isNotFound, isStationId, useForecast, useHistory, useStationDetail, useStations } from '@/lib/api';
import { offFor, offText, yourPrice } from '@/lib/discounts';
import { brandSuburb, fmt, fuelName, nice, stationName, sydneyToday, updatedText } from '@/lib/format';
import { km } from '@/lib/geo';
import { dayLabel, toneOf } from '@/lib/outlook';
import { MAX_PINS, togglePin, usePins } from '@/lib/pins';
import { useSettings } from '@/lib/settings';
import {
  behaviour, chartSummary, forecastTiles, fuelsSold, openInMaps, pickFuel, RANGES, rangeStats, riseText,
  tankText, ticker, tickerData, type Change, type RangeKey,
} from '@/lib/station';
import type { Fuel, Station } from '@/lib/types';

const SHORT: Record<Fuel, string> = { U91: 'U91', E10: 'E10', P98: 'P98', DL: 'Diesel' };

export default function StationPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const pins = usePins();
  const q = useStationDetail(id);
  const fq = useForecast();
  const hq = useHistory();
  const sq = useStations();
  const d = q.data;
  const row: Station | undefined = useMemo(() => sq.data?.stations.find((x) => x.id === id), [sq.data, id]);

  const sold = useMemo(() => (d ? fuelsSold(d) : []), [d]);
  const [fuelSel, setFuel] = useState<Fuel | null>(null);
  const fuel = fuelSel && sold.includes(fuelSel) ? fuelSel : pickFuel(sold, s.fuel);
  const [range, setRange] = useState<RangeKey>('3M');
  const [scrubbing, setScrubbing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.length > 40 ? 5000 : 2500);   // a fill's "Logged…" line needs longer
    return () => clearTimeout(t);
  }, [note]);

  const pinned = !!id && pins.includes(id);
  const onPin = () => {
    if (!id) return;
    if (!togglePin(id)) setNote(`You can pin up to ${MAX_PINS} stations`);
  };

  // Header facts: from the station file, or from today's stations.json while it loads (or if it fails)
  const head = d ?? row;
  const name = head ? stationName(head.n) : 'Station';
  const dist = head && s.home ? km(s.home.la, s.home.lo, head.la, head.lo) : null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const live = fuel ? fq.data?.live.find((r) => r.fuel === fuel) : undefined;
  const tk = d && fuel ? ticker(d, fuel, live?.now ?? null) : null;
  const hasHist = !!(d && fuel && d.hist[fuel]?.some((v) => v != null));
  // The React Compiler memoizes this (and the paths in TickerChart key off its identity)
  const chart = d && fuel ? tickerData(d, hq.data, fuel, hasHist ? range : '1W') : null;
  const stats = chart ? rangeStats(chart) : null;
  const fc = d && fuel ? d.fc[fuel] : undefined;
  const tone = live ? toneOf(live.verdict.cls) : undefined;   // Sydney verdict tone, for the rise wording
  const badId = !isStationId(id);
  const age = fuel ? row?.p[fuel]?.[1] ?? null : null;
  const off = head ? offFor(s.discounts, head.b) : 0;   // your discount at this brand; the ticker stays the pump price
  const refresh = () => { q.refetch(); fq.refetch(); hq.refetch(); sq.refetch(); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.topBar, { paddingTop: insets.top + 4, backgroundColor: c.bg, borderBottomColor: c.line }]}>
        <IconButton label="Back" onPress={goBack}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" stroke={c.fg} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </IconButton>
        <T numberOfLines={1} style={{ flex: 1, fontWeight: '700', fontSize: 16 }} color={c.fg}>{head ? name : ''}</T>
        {head || pinned ? (
          <IconButton label={pinned ? 'Unpin this station' : 'Pin this station'} onPress={onPin} selected={pinned}>
            <PinIcon on={pinned} color={pinned ? c.actStrong : c.fg} />
          </IconButton>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={!scrubbing}
        contentContainerStyle={{ padding: Spacing.four, paddingBottom: Spacing.six + insets.bottom, gap: Spacing.five }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={refresh} tintColor={c.muted} />}>

        {/* Header */}
        <View style={{ gap: Spacing.three }}>
          {head ? (
            <View style={{ gap: 4 }}>
              <T kind="title" style={{ fontSize: 26 }}>{name}</T>
              <T kind="small" color={c.fg2}>
                {[brandSuburb(name, head.b, head.s), dist != null ? `${dist.toFixed(1)} km${s.home?.gps ? ' away' : ` from ${s.home!.label}`}` : null, head.m ? 'Members only' : null]
                  .filter(Boolean).join(' · ')}
              </T>
              {d?.addr ? <T kind="small">{d.addr}</T> : null}
            </View>
          ) : !badId && (q.isPending || sq.isPending) ? (
            <Skeleton h={58} w="70%" />
          ) : null}
          {head ? (
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <ActionButton
                label="Map" primary
                onPress={() => openInMaps(head.la, head.lo, name)}
                icon={<MapPinIcon color={c.bg} size={18} />}
              />
              <ActionButton
                label={pinned ? 'Pinned' : 'Pin'} onPress={onPin} selected={pinned}
                icon={<PinIcon on={pinned} color={pinned ? c.actStrong : c.fg} size={18} />}
              />
              {fuel && tk?.price != null ? (
                <ActionButton label="Filled up" onPress={() => setFilling(true)} icon={<PumpIcon color={c.fg} size={18} />} />
              ) : null}
            </View>
          ) : null}
          {filling && head && fuel && tk?.price != null ? (
            <FillSheet
              station={{ id: id ?? '', n: head.n, b: head.b, s: head.s }}
              fuel={fuel}
              price={yourPrice(tk.price, off)}
              pump={tk.price}
              median={live && fq.data?.asof === sydneyToday() ? live.now : null}   // yesterday's median isn't today's
              tankL={s.tankL}
              onClose={() => setFilling(false)}
              onSaved={setNote}
            />
          ) : null}
          {note ? (
            <View style={[styles.note, { backgroundColor: c.fg }]} accessibilityLiveRegion="polite">
              <T kind="small" color={c.bg} style={{ fontWeight: '600' }}>{note}</T>
            </View>
          ) : null}
        </View>

        {!d ? (
          q.error || badId ? (
            row ? (
              <ListFallback row={row} preferred={s.fuel} off={off} medianOf={(f) => fq.data?.live.find((r) => r.fuel === f)?.now}
                notFound={badId || isNotFound(q.error)} onRetry={() => q.refetch()} />
            ) : sq.isPending && !badId ? (
              <LoadingSkeleton />
            ) : (
              <Card style={{ gap: Spacing.two }}>
                <T kind="h2">Couldn’t load this station</T>
                <T>{badId || isNotFound(q.error) ? 'This station isn’t in today’s data.' : 'Check your connection and try again.'}</T>
                {!badId && (!isNotFound(q.error) || sq.isError) ? (
                  <Pressable onPress={refresh} accessibilityRole="button" style={styles.retry} hitSlop={8}>
                    <T color={c.tgp} style={{ fontWeight: '700' }}>Try again</T>
                  </Pressable>
                ) : null}
              </Card>
            )
          ) : (
            <LoadingSkeleton />
          )
        ) : !fuel || !tk ? (
          <Card><T>This station has no prices in the data right now.</T></Card>
        ) : (
          <>
            {q.isError ? (
              <View style={[styles.banner, { backgroundColor: c.actBg }]}>
                <T kind="small" color={c.actFg}>
                  {isNotFound(q.error) ? 'Today’s station history isn’t available yet.' : 'Couldn’t refresh.'} Showing saved prices from {nice(d.asof)}.
                </T>
              </View>
            ) : (
              <StaleBanner asof={d.asof} />
            )}

            {sold.length > 1 ? (
              <Tabs
                label="Fuel"
                options={sold.map((f) => [f, SHORT[f]] as const)}
                value={fuel}
                onChange={setFuel}
              />
            ) : null}

            {/* Ticker block */}
            <View style={{ gap: 6 }} accessible accessibilityLabel={tickerA11y(fuel, tk)}>
              <T kind="eyebrow">{fuelName(fuel)} · {dayLabel(d.asof)}</T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <T kind="hero" style={{ fontSize: 44, lineHeight: 50, letterSpacing: -1.2 }}>
                  {tk.price != null ? tk.price.toFixed(1) : '–'}
                </T>
                <T kind="small" style={{ fontWeight: '600' }}>c/L</T>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four, rowGap: 4 }}>
                <Move ch={tk.d1} label="since yesterday" />
                <Move ch={tk.d7} label="over 7 days" />
              </View>
              {tk.gap != null && live ? (
                <T kind="small" color={c.fg2}>
                  <Text style={{ color: tk.gap < -0.05 ? c.cheap : tk.gap > 0.05 ? c.dear : c.fg2, fontWeight: '700' }}>
                    {Math.abs(tk.gap) < 0.05 ? 'At the Sydney median' : `${Math.abs(tk.gap).toFixed(1)}c ${tk.gap < 0 ? 'cheaper' : 'dearer'}`}
                  </Text>
                  {Math.abs(tk.gap) < 0.05 ? ` (${live.now.toFixed(1)}c)` : ` than the Sydney median (${live.now.toFixed(1)}c)`}
                </T>
              ) : null}
              {off && tk.price != null ? (
                <T kind="small" color={c.fg2}>
                  You pay <Text style={{ color: c.cheap, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{yourPrice(tk.price, off).toFixed(1)}</Text>
                  {` with your ${offText(off)} off at ${head!.b}`}
                </T>
              ) : null}
              <T kind="small" color={age != null && age > 7 ? c.up : c.muted}>
                {age != null
                  ? `${updatedText(age)}${age > 7 ? '. Check the price before you drive there.' : ''}`
                  : tk.unchangedDays != null && tk.unchangedDays > 0
                    ? `Price unchanged for ${tk.unchangedDays} day${tk.unchangedDays === 1 ? '' : 's'}`
                    : `Prices as of ${nice(d.asof)}`}
              </T>
            </View>

            {/* Chart */}
            {chart ? (
              <View style={{ gap: Spacing.three }}>
                {hasHist ? (
                  <Tabs label="Chart range" options={RANGES.map(([k]) => [k, k] as const)} value={range} onChange={setRange} stretch />
                ) : (
                  <Card style={{ paddingVertical: Spacing.three }}>
                    <T kind="small" color={c.fg2}>
                      No {fuelName(fuel)} price history for this station yet, so the chart shows the forecast only.
                    </T>
                  </Card>
                )}
                <TickerChart
                  t={chart}
                  color={lineColor(chart, c)}
                  summary={stats ? chartSummary(chart, stats, fuel, hasHist ? range : '1W') : ''}
                  onScrubbing={setScrubbing}
                />
                {hasHist && stats ? (
                  <View style={[styles.stats, { borderColor: c.line }]}>
                    <Stat label="Low" value={stats.low ? stats.low.v.toFixed(1) : '–'} sub={stats.low ? nice(stats.low.date, false) : ''} />
                    <Stat label="High" value={stats.high ? stats.high.v.toFixed(1) : '–'} sub={stats.high ? nice(stats.high.date, false) : ''} />
                    <Stat
                      label="Avg vs median"
                      value={stats.avgGap != null ? `${fmt(stats.avgGap)}c` : '–'}
                      sub={stats.avg != null ? `avg ${stats.avg.toFixed(1)}` : ''}
                      color={stats.avgGap == null ? undefined : stats.avgGap < -0.05 ? c.cheap : stats.avgGap > 0.05 ? c.dear : undefined}
                    />
                    <Stat label="Jumps" value={String(stats.jumps)} sub="of 5c or more" last />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Forecast */}
            {fc ? (
              <Section title="Forecast for this station">
                <Card style={{ gap: Spacing.three }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' }}>
                    <Badge tone={ADVICE_TONE[fc.adv[0]] ?? 'calm'}>{fc.adv[1]}</Badge>
                    <T style={{ fontWeight: '700' }} color={c.fg}>{riseText(fc, d.asof, tone)}</T>
                  </View>
                  <View style={styles.tiles}>
                    {forecastTiles(fc, d.asof).map((t) => (
                      <View key={t.h} style={[styles.tile, { backgroundColor: c.sunk }]}
                        accessible accessibilityLabel={`${t.label}: about ${t.v.toFixed(1)} cents, ${fmt(t.delta)} cents`}>
                        <T kind="eyebrow" style={{ fontSize: 10 }}>{t.label}</T>
                        <T kind="num">{t.v.toFixed(1)}</T>
                        <T kind="small" color={t.delta > 0.05 ? c.dear : t.delta < -0.05 ? c.cheap : c.muted} style={{ fontWeight: '600' }}>
                          {fmt(t.delta)}c
                        </T>
                      </View>
                    ))}
                  </View>
                  <T color={c.fg2}>{tankText(fc, d.asof, s.tankL, tone)}</T>
                </Card>
              </Section>
            ) : (
              <Card><T>No forecast for {fuelName(fuel)} at this station today.</T></Card>
            )}

            {/* Behaviour */}
            <Section title="How this station behaves">
              <Card style={{ gap: Spacing.two }}>
                {(() => {
                  const lines = behaviour(d.profile, fuel);
                  if (!lines.length)
                    return <T color={c.fg2}>Not enough history yet.</T>;
                  return (
                    <>
                      {lines.map((l) => (
                        <View key={l} style={{ flexDirection: 'row', gap: Spacing.two }}>
                          <T color={c.muted}>•</T>
                          <T color={c.fg2} style={{ flex: 1 }}>{l}</T>
                        </View>
                      ))}
                    </>
                  );
                })()}
              </Card>
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function lineColor(t: { px: (number | null)[]; today: number }, c: ReturnType<typeof useTheme>) {
  const vals = t.px.filter((v): v is number => v != null);
  if (vals.length < 2) return c.fg2;
  const ch = vals[vals.length - 1] - vals[0];
  return ch < -0.05 ? c.cheap : ch > 0.05 ? c.dear : c.fg2;
}

function tickerA11y(fuel: Fuel, tk: ReturnType<typeof ticker>) {
  const parts = [`${fuelName(fuel)} ${tk.price != null ? `${tk.price.toFixed(1)} cents a litre` : 'no price'}`];
  const say = (ch: Change, when: string) =>
    ch && parts.push(Math.abs(ch.c) < 0.05 ? `unchanged ${when}` : `${ch.c < 0 ? 'down' : 'up'} ${Math.abs(ch.c).toFixed(1)} cents ${when}`);
  say(tk.d1, 'since yesterday');
  say(tk.d7, 'over 7 days');
  if (tk.gap != null) parts.push(`${Math.abs(tk.gap).toFixed(1)} cents ${tk.gap < 0 ? 'below' : 'above'} the Sydney median`);
  return parts.join(', ');
}

/** Change in c/L and %, coloured like a stock (down = cheap colour, up = dear colour) */
function Move({ ch, label }: { ch: Change; label: string }) {
  const c = useTheme();
  if (!ch) return <T kind="small">– {label}</T>;
  const flat = Math.abs(ch.c) < 0.05;
  const color = flat ? c.muted : ch.c < 0 ? c.cheap : c.dear;
  return (
    <T kind="small">
      <Text style={{ color, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {flat ? '● 0.0c' : `${ch.c < 0 ? '▼' : '▲'} ${Math.abs(ch.c).toFixed(1)}c (${fmt(ch.pct)}%)`}
      </Text>
      {` ${label}`}
    </T>
  );
}

/** Today's price, gap and advice from stations.json, for when the station file is missing (404 on a day the
 *  per-station export failed soft) or can't load, and nothing is cached */
function ListFallback({
  row, preferred, off, medianOf, notFound, onRetry,
}: { row: Station; preferred: Fuel; off: number; medianOf: (f: Fuel) => number | undefined; notFound: boolean; onRetry: () => void }) {
  const c = useTheme();
  const sold = (Object.keys(row.p) as Fuel[]).filter((f) => row.p[f]?.[0] != null);
  const order = (['U91', 'E10', 'P98', 'DL'] as Fuel[]).filter((f) => sold.includes(f));
  const [pick, setPick] = useState<Fuel | null>(null);
  const fuel = pick && order.includes(pick) ? pick : pickFuel(order, preferred);
  const p = fuel ? row.p[fuel] : undefined;
  const med = fuel ? medianOf(fuel) : undefined;
  const gap = p && med != null ? p[0] - med : null;
  return (
    <>
      {order.length > 1 && fuel ? (
        <Tabs label="Fuel" options={order.map((f) => [f, SHORT[f]] as const)} value={fuel} onChange={setPick} />
      ) : null}
      {p && fuel ? (
        <View style={{ gap: 6 }}>
          <T kind="eyebrow">{fuelName(fuel)} · today</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T kind="hero" style={{ fontSize: 44, lineHeight: 50, letterSpacing: -1.2 }}>{p[0].toFixed(1)}</T>
            <T kind="small" style={{ fontWeight: '600' }}>c/L</T>
          </View>
          {gap != null ? (
            <T kind="small" color={c.fg2}>
              <Text style={{ color: gap < -0.05 ? c.cheap : gap > 0.05 ? c.dear : c.fg2, fontWeight: '700' }}>
                {Math.abs(gap) < 0.05 ? 'At the Sydney median' : `${Math.abs(gap).toFixed(1)}c ${gap < 0 ? 'cheaper' : 'dearer'}`}
              </Text>
              {Math.abs(gap) < 0.05 ? ` (${med!.toFixed(1)}c)` : ` than the Sydney median (${med!.toFixed(1)}c)`}
            </T>
          ) : null}
          {off ? (
            <T kind="small" color={c.fg2}>
              You pay <Text style={{ color: c.cheap, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{yourPrice(p[0], off).toFixed(1)}</Text>
              {` with your ${offText(off)} off at ${row.b}`}
            </T>
          ) : null}
          <T kind="small" color={p[1] != null && p[1] > 7 ? c.up : c.muted}>{updatedText(p[1])}</T>
          <View style={{ gap: 6, marginTop: Spacing.two }}>
            <Badge tone={ADVICE_TONE[p[2]] ?? 'calm'}>{p[3]}</Badge>
            {p[4] ? <T color={c.fg2}>{p[4].replace(/\.$/, '')}.</T> : null}
          </View>
        </View>
      ) : null}
      <Card style={{ gap: Spacing.two }}>
        <T style={{ fontWeight: '700' }} color={c.fg}>Price history isn’t available right now</T>
        <T kind="small" color={c.fg2}>
          {notFound
            ? 'The chart and this station’s forecast should be back with the next daily update.'
            : 'The chart and forecast didn’t load. Check your connection.'}
        </T>
        {!notFound ? (
          <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry} hitSlop={8}>
            <T color={c.tgp} style={{ fontWeight: '700' }}>Try again</T>
          </Pressable>
        ) : null}
      </Card>
    </>
  );
}

/** Segmented control with 44dp targets (ui.tsx's Segmented is more compact than we want here) */
function Tabs<K extends string>({
  label, options, value, onChange, stretch,
}: { label: string; options: readonly (readonly [K, string])[]; value: K; onChange: (k: K) => void; stretch?: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: c.sunk }, stretch && { alignSelf: 'stretch' }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(([k, text]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.segBtn, stretch && { flex: 1 }, on && { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={{ color: on ? c.fg : c.muted, fontWeight: on ? '700' : '600', fontSize: 14 }}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({ label, value, sub, color, last }: { label: string; value: string; sub: string; color?: string; last?: boolean }) {
  const c = useTheme();
  return (
    <View style={[styles.stat, !last && { borderRightColor: c.line, borderRightWidth: StyleSheet.hairlineWidth }]}>
      <T kind="eyebrow" style={{ fontSize: 10 }} numberOfLines={1}>{label}</T>
      <T kind="num" color={color}>{value}</T>
      <T kind="small" style={{ fontSize: 11 }} numberOfLines={1}>{sub}</T>
    </View>
  );
}

function IconButton({ label, onPress, selected, children }: { label: string; onPress: () => void; selected?: boolean; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected != null ? { selected } : undefined}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

function ActionButton({ label, onPress, icon, primary, selected }: { label: string; onPress: () => void; icon: ReactNode; primary?: boolean; selected?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected != null ? { selected } : undefined}
      style={({ pressed }) => [
        styles.action,
        primary ? { flex: 1, backgroundColor: c.fg, borderColor: c.fg } : { backgroundColor: selected ? c.actBg : c.surface, borderColor: selected ? c.actStrong : c.line },
        pressed && { opacity: 0.7 },
      ]}>
      {icon}
      <Text style={{ color: primary ? c.bg : selected ? c.actFg : c.fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

function PinIcon({ on, color, size = 22 }: { on: boolean; color: string; size?: number }) {
  // A push-pin: filled when pinned
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 3h6l-1 6 3.5 3.5v1.5H6.5v-1.5L10 9zM12 14v7"
        stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill={on ? color : 'none'}
      />
    </Svg>
  );
}

function Skeleton({ h, w = '100%', r = 10 }: { h: number; w?: number | `${number}%`; r?: number }) {
  const c = useTheme();
  return <View style={{ height: h, width: w, borderRadius: r, backgroundColor: c.sunk }} />;
}

function LoadingSkeleton() {
  return (
    <View style={{ gap: Spacing.five }} accessibilityLabel="Loading station" accessibilityRole="progressbar">
      <Skeleton h={44} w="60%" r={Radius.chip} />
      <View style={{ gap: 8 }}>
        <Skeleton h={12} w="35%" />
        <Skeleton h={48} w="45%" />
        <Skeleton h={14} w="70%" />
      </View>
      <Skeleton h={44} r={Radius.chip} />
      <Skeleton h={260} />
      <Skeleton h={160} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  // 14 dp sides: Map, Pinned and Filled up fit one row at 360 dp
  action: { minHeight: 46, borderWidth: 1, borderRadius: Radius.input, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  note: { borderRadius: Radius.input, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, alignSelf: 'flex-start' },
  banner: { borderRadius: Radius.input, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  seg: { flexDirection: 'row', borderRadius: Radius.chip, padding: 3, gap: 2, alignSelf: 'flex-start' },
  segBtn: { minHeight: 44, minWidth: 52, paddingHorizontal: 14, borderRadius: Radius.chip, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.three },
  stat: { flex: 1, paddingHorizontal: Spacing.two, gap: 2 },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: Radius.input, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two, gap: 2 },
});
