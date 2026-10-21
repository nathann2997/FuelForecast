import * as Location from 'expo-location';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { Card, FuelPicker, Loading, Screen, Segmented, StaleBanner, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useForecast, useStations } from '@/lib/api';
import { ADVICE_CLS, WHEN_NOTE } from '@/lib/copy';
import { fmt, fuelName, nice, updatedText } from '@/lib/format';
import { findSuburb, rankStations, type Place, type StationRow } from '@/lib/geo';
import { setSettings, useSettings } from '@/lib/settings';

const RADII = [['2', '2 km'], ['5', '5 km'], ['10', '10 km'], ['20', '20 km']] as const;
const SORTS = [['price', 'Cheapest'], ['distance', 'Nearest']] as const;
const SHOW = 60;

export default function Stations() {
  const c = useTheme();
  const s = useSettings();
  const sq = useStations();
  const fq = useForecast();
  const [query, setQuery] = useState('');
  const [gps, setGps] = useState<Place | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const data = sq.data;
  const searched = useMemo(() => (data && query ? findSuburb(data.suburbs, query) : null), [data, query]);
  const home = query ? searched : gps;
  const rows = useMemo(
    () => (data ? rankStations(data.stations, s.fuel, { home, radiusKm: s.radiusKm, members: s.members, sort: s.sort }) : []),
    [data, s.fuel, home, s.radiusKm, s.members, s.sort],
  );
  const suggestions = useMemo(() => {
    if (!data || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return data.suburbs.filter((x) => x.s.toLowerCase().startsWith(q) || String(x.pc).startsWith(q)).slice(0, 6);
  }, [data, query]);
  const median = fq.data?.live.find((x) => x.fuel === s.fuel)?.now;

  async function onNearMe() {
    setLocMsg(null);
    setLocating(true);
    const msg = await locate().then(
      (p) => {
        setGps(p);
        setQuery('');
        return null;
      },
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );
    setLocMsg(msg);
    setLocating(false);
  }

  const near = home ? new Set(rows.map((r) => r.s)).size : 0;
  const note = home
    ? `${rows.length} station${rows.length === 1 ? '' : 's'} within ${s.radiusKm} km of ${home.label}, across ${near} suburb${near === 1 ? '' : 's'}, ${s.sort === 'distance' ? 'nearest' : 'cheapest'} first${rows.length > SHOW ? ` (top ${SHOW} shown)` : ''}. Distance is straight-line${home === gps ? '' : " from the suburb's centre"}.`
    : `Cheapest ${Math.min(SHOW, rows.length)} of ${rows.length} Sydney stations selling ${fuelName(s.fuel)} today. Use your location or search a suburb to see what's nearby.`;

  return (
    <Screen
      title="Cheapest stations"
      eyebrow={data ? `${fuelName(s.fuel)} · ${nice(data.asof)}` : 'Stations'}
      onRefresh={() => { sq.refetch(); fq.refetch(); }}
      refreshing={sq.isRefetching}>
      <FuelPicker />
      {!data ? (
        <Loading error={sq.error} onRetry={() => sq.refetch()} />
      ) : (
        <>
          <StaleBanner asof={data.asof} />
          <View style={{ gap: Spacing.two }}>
            <View style={styles.row}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Suburb or postcode, e.g. Parramatta, 2150"
                placeholderTextColor={c.muted}
                autoCorrect={false}
                style={[styles.input, { color: c.fg, borderColor: c.line, backgroundColor: c.surface }]}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              <Pressable
                onPress={onNearMe}
                accessibilityRole="button"
                style={[styles.locBtn, { backgroundColor: gps && !query ? c.fg : c.surface, borderColor: c.line }]}>
                <T style={{ fontWeight: '700' }} color={gps && !query ? c.bg : c.fg}>{locating ? '…' : '◎ Near me'}</T>
              </Pressable>
            </View>
            {suggestions.length > 0 && !(searched && suggestions.length === 1 && `${searched.label}` === `${suggestions[0].s} ${suggestions[0].pc}`) ? (
              <View style={styles.chips}>
                {suggestions.map((x) => (
                  <Pressable key={`${x.s}|${x.pc}`} onPress={() => setQuery(`${x.s} ${x.pc}`)} style={[styles.chip, { borderColor: c.line, backgroundColor: c.surface }]}>
                    <T kind="small" color={c.fg2}>{x.s} {x.pc}</T>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {query && !searched ? <T kind="small" color={c.up}>No Sydney suburb matches “{query}”. Try a postcode.</T> : null}
            {locMsg ? <T kind="small" color={c.up}>{locMsg}</T> : null}
          </View>

          {home ? (
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <Segmented options={RADII} value={String(s.radiusKm) as (typeof RADII)[number][0]} onChange={(k) => setSettings({ radiusKm: Number(k) })} />
              <Segmented options={SORTS} value={s.sort} onChange={(k) => setSettings({ sort: k })} />
            </View>
          ) : null}
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <T>Include members-only sites</T>
            <Switch value={s.members} onValueChange={(v) => setSettings({ members: v })} />
          </View>

          <T kind="small">{note}</T>
          <View style={{ gap: Spacing.two }}>
            {rows.length === 0 ? <Card><T>No stations match these filters.</T></Card> : null}
            {rows.slice(0, SHOW).map((r, i) => (
              <StationCard key={`${r.n}|${r.la}|${r.lo}`} r={r} rank={i + 1} median={median} />
            ))}
          </View>
          <T kind="small">{WHEN_NOTE} Prices are as last reported to FuelCheck; check stations not updated for over a week before driving there.</T>
        </>
      )}
    </Screen>
  );
}

/** Device position, or an Error with a message fit to show */
async function locate(): Promise<Place> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission was not given. Search a suburb or postcode instead.');
  const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
  const pos =
    last ??
    (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('Location timed out. Try again, or search a suburb.')), 15000)),
    ]));
  return { label: 'your location', la: pos.coords.latitude, lo: pos.coords.longitude };
}

function StationCard({ r, rank, median }: { r: StationRow; rank: number; median: number | undefined }) {
  const c = useTheme();
  const [, , code, label, reason] = r.adv;
  const advCol = c[ADVICE_CLS[code] ?? 'flat'];
  const name = r.n.replace(/\s*\(members only\)/i, '');
  const open = () =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${r.la},${r.lo}&travelmode=driving`).catch(() => {});
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityHint="Opens directions in Google Maps">
      <Card style={{ gap: Spacing.two, padding: Spacing.three }}>
        <View style={[styles.row, { alignItems: 'flex-start' }]}>
          <T kind="num" color={c.muted} style={{ width: 24 }}>{rank}</T>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontWeight: '700', flexShrink: 1 }} color={c.fg} numberOfLines={2}>
              {name}{r.m ? '  · Members only' : ''}
            </T>
            <T kind="small">{r.b} · {r.s} {r.pc}{r.d != null ? ` · ${r.d.toFixed(1)} km` : ''}</T>
            <T kind="small">{updatedText(r.age)}{r.age != null && r.age > 7 ? ' · check before driving' : ''}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T kind="bignum" style={{ fontSize: 20 }}>{r.price.toFixed(1)}</T>
            {median != null ? (
              <T kind="small" color={r.price < median ? c.cheap : c.muted}>{fmt(r.price - median)} vs median</T>
            ) : null}
          </View>
        </View>
        <View style={{ paddingLeft: 24, gap: 2 }}>
          <T style={{ fontWeight: '700' }} color={advCol}>{label}</T>
          <T kind="small">{reason}</T>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  locBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
