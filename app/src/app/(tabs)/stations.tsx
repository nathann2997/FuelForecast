import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaPicker } from '@/components/area-picker';
import { FilterSheet } from '@/components/filter-sheet';
import { FilterIcon, ListIcon, MapIcon } from '@/components/icons';
import { MissingPinItem, rowKey, StationItem } from '@/components/station-row';
import { StationMap } from '@/components/station-map';
import { Button, Card, Disclosure, FuelChip, Loading, Screen, StaleBanner, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useArea, useAreaLive } from '@/hooks/use-area';
import { useTheme } from '@/hooks/use-theme';
import { track, useReady } from '@/lib/analytics';
import { useForecast, useStations } from '@/lib/api';
import { WHEN_NOTE } from '@/lib/copy';
import { applyFilters, brandCounts, filterCount, pinnedRows } from '@/lib/filters';
import { nice, refreshedText } from '@/lib/format';
import { areaName, rankStations } from '@/lib/geo';
import { mapStations } from '@/lib/map';
import { toneOf } from '@/lib/outlook';
import { usePins } from '@/lib/pins';
import { resetFilters, setSettings, useSettings } from '@/lib/settings';

const PAGE = 30;

/** No map on the web preview (react-native-maps is native only). Android builds always carry the key (app.config.js). */
const MAPS_ON = Platform.OS !== 'web';

export default function Stations() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const home = useArea();
  const live = useAreaLive();
  const pins = usePins();
  const sq = useStations();
  const fq = useForecast();
  useReady(!sq.isPending);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const view = MAPS_ON ? s.view : 'list';
  const openFilters = () => {
    track('filters.opened', { view });
    setSheet(true);
  };
  // Paging resets whenever the list itself changes (fuel, area, sort or any filter)
  const sig = [s.fuel, home?.la, home?.lo, s.radiusKm, s.sort, s.members, s.showStale, s.brands.join(','), s.advice.join(','), s.maxPrice, s.pinnedOnly, JSON.stringify(s.discounts)].join('|');
  const [page, setPage] = useState({ sig, n: PAGE });
  const show = page.sig === sig ? page.n : PAGE;
  const setShow = (n: number) => setPage({ sig, n });

  const data = sq.data;
  const ranked = useMemo(
    () => (data ? rankStations(data.stations, s.fuel, { home, radiusKm: s.radiusKm, members: s.members, sort: s.sort, discounts: s.discounts }) : []),
    [data, s.fuel, home, s.radiusKm, s.members, s.sort, s.discounts],
  );
  const brands = useMemo(() => (data ? brandCounts(data.stations, s.fuel) : []), [data, s.fuel]);
  const pinned = useMemo(() => (data ? pinnedRows(data.stations, s.fuel, pins, home, s.discounts) : []), [data, s.fuel, pins, home, s.discounts]);

  const pinSet = new Set(pins);
  const unpinned = (f: typeof s) => applyFilters(ranked, f).filter((x) => !pinSet.has(x.id));
  const filtered = unpinned(s);
  // How many more the "older prices" switch would add (shown in the sheet and the empty state)
  const staleN = unpinned({ ...s, showStale: true }).length - unpinned({ ...s, showStale: false }).length;
  const rows = s.pinnedOnly ? [] : filtered;
  const total = pinned.filter((p) => p.row).length + rows.length;   // greyed pins with no price don't count
  const nFilters = filterCount(s);

  const r = fq.data?.live.find((x) => x.fuel === s.fuel);
  const sydney = r ? toneOf(r.verdict.cls) : undefined;   // rows leave out advice that only repeats it
  const area = home && data ? areaName(home, data.suburbs, live) : null;
  const order = s.pinnedOnly ? 'pinned only' : `${home ? `within ${s.radiusKm} km, ` : ''}${home && s.sort === 'distance' ? 'nearest' : 'cheapest'} first`;

  // ---- The map: the same filters as the list, for every station (it shows the ones in view)
  const onMap = view === 'map' && !!data;
  const mapArea = useMemo(
    () => (onMap ? mapStations(data!.stations, s.fuel, { home, members: s.members, discounts: s.discounts }) : []),
    [onMap, data, s.fuel, home, s.members, s.discounts],
  );
  // Older prices stay on the map, greyed (station-map.tsx), instead of hidden: some sites, Costco among them, report rarely
  const mapAll = useMemo(() => applyFilters(mapArea, { ...s, showStale: true }).filter((x) => x.id), [mapArea, s]);   // a tag needs an id (old caches have none)
  const mapPinned = useMemo(() => pinned.flatMap((p) => (p.row ? [p.row] : [])), [pinned]);
  const mapRows = useMemo(() => (s.pinnedOnly ? [] : mapAll.filter((x) => !pinSet.has(x.id))), [s.pinnedOnly, mapAll, pins]);   // eslint-disable-line react-hooks/exhaustive-deps
  
  const setView = (v: 'list' | 'map') => setSettings({ view: v });
  const toggle = MAPS_ON && data ? <ViewToggle view={view} onPress={() => setView(view === 'map' ? 'list' : 'map')} /> : null;
  const sheetEl = (
    <FilterSheet
      visible={sheet}
      onClose={() => setSheet(false)}
      brands={brands}
      staleCount={staleN}
      resultCount={onMap ? null : total}
      hasHome={!!home}
    />
  );
  const filtersBtn = (
    <Pressable
      onPress={openFilters}
      accessibilityRole="button"
      accessibilityLabel={nFilters ? `Filters, ${nFilters} on` : 'Filters'}
      style={({ pressed }) => [
        styles.filterBtn,
        { borderColor: nFilters ? c.fg : c.line, backgroundColor: nFilters ? c.fg : c.surface, opacity: pressed ? 0.7 : 1 },
      ]}>
      <FilterIcon size={18} color={nFilters ? c.bg : c.fg} />
      <T style={{ fontWeight: '700', fontSize: 14 }} color={nFilters ? c.bg : c.fg}>
        Filters{nFilters ? ` (${nFilters})` : ''}
      </T>
    </Pressable>
  );

  if (onMap) {
    const where = home ? `Near ${area!.text}` : 'Set your area';
    const lastKnown = !!area?.lastKnown;
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* The list's header (Screen in ui.tsx) without the scroll, so switching views doesn't move it */}
        <View style={[styles.mapHead, { paddingTop: insets.top + Spacing.four }]}>
          <View style={styles.toolbar}>
            <View style={{ flex: 1, gap: 2 }}>
              <T kind="small">{refreshedText(data.generated_at) || `Prices as of ${nice(data.asof)}`}</T>
              <T kind="title" accessibilityRole="header">Stations</T>
            </View>
            <FuelChip />
          </View>
          <View style={styles.toolbar}>
            <Pressable
              onPress={() => {
                setView('list');
                setEditing(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Area: ${where}${lastKnown ? ', last known location' : ''}. Change area`}
              style={[styles.area, styles.mapArea, { backgroundColor: c.surface, borderColor: c.line }]}>
              <T color={c.fg} style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                {home?.gps && !lastKnown ? '◎  ' : ''}{where}
              </T>
              {lastKnown ? <T kind="small" color={c.muted}>last known</T> : null}
              <View style={{ flex: 1 }} />
              <T kind="small" color={c.tgp} style={{ fontWeight: '700' }}>Change</T>
            </Pressable>
            <Pressable
              onPress={openFilters}
              accessibilityRole="button"
              accessibilityLabel={nFilters ? `Filters, ${nFilters} on` : 'Filters'}
              style={({ pressed }) => [
                styles.iconBtn,
                { borderColor: nFilters ? c.fg : c.line, backgroundColor: nFilters ? c.fg : c.surface, opacity: pressed ? 0.7 : 1 },
              ]}>
              <FilterIcon size={18} color={nFilters ? c.bg : c.fg} />
              {nFilters ? <T style={{ fontWeight: '700', fontSize: 14 }} color={c.bg}>{nFilters}</T> : null}
            </Pressable>
          </View>
          <StaleBanner asof={data.asof} />
        </View>
        <View style={{ flex: 1 }}>
          <StationMap
            rows={mapRows}
            pinned={mapPinned}
            home={home}
            live={live}
            radiusKm={s.radiusKm}
            median={r?.now}
            footer={toggle}
          />
        </View>
        {sheetEl}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <Screen
      title="Stations"
      subtitle={data ? refreshedText(data.generated_at) || `Prices as of ${nice(data.asof)}` : undefined}
      onRefresh={() => { sq.refetch(); fq.refetch(); }}
      refreshing={sq.isRefetching}>
      {!data ? (
        <Loading error={sq.error} onRetry={() => sq.refetch()} />
      ) : (
        <>
          <StaleBanner asof={data.asof} />

          {home && !editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel={`Area: near ${area!.text}${area!.lastKnown ? ', last known location' : ''}, ${s.radiusKm} kilometres. Change area`}
              style={[styles.area, { backgroundColor: c.surface, borderColor: c.line }]}>
              {/* the place name gives way first; the radius and "last known" always show */}
              <T color={c.fg} style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>
                {home.gps ? '◎  ' : ''}Near {area!.text}
              </T>
              <T color={c.fg} style={{ fontWeight: '700' }}>· {s.radiusKm} km</T>
              {area!.lastKnown ? <T kind="small" color={c.muted}>last known</T> : null}
              <View style={{ flex: 1 }} />
              <T kind="small" color={c.tgp} style={{ fontWeight: '700' }}>Change</T>
            </Pressable>
          ) : (
            <Card style={{ gap: Spacing.three }}>
              <T color={c.fg2}>{home ? 'Change your area' : 'Where do you fill up?'}</T>
              <AreaPicker suburbs={data.suburbs} onDone={() => setEditing(false)} />
              {home ? <Button label="Cancel" kind="secondary" onPress={() => setEditing(false)} /> : null}
            </Card>
          )}

          <View style={styles.toolbar}>
            <T color={c.fg} style={{ fontWeight: '700', flex: 1 }} accessibilityRole="header">
              {total} station{total === 1 ? '' : 's'}
              <T kind="small" style={{ fontWeight: '400' }}>{`  ${order}`}</T>
            </T>
            {filtersBtn}
          </View>

          {!pins.length && total > 0 ? (
            <T kind="small" style={{ marginTop: -Spacing.two }}>Swipe a station left to pin it or see it on the map.</T>
          ) : null}

          {pinned.length ? (
            <View style={{ gap: Spacing.two }}>
              <T kind="eyebrow">Pinned</T>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {pinned.map((p, i) =>
                  p.row ? (
                    <StationItem key={p.id} r={p.row} median={r?.now} sydney={sydney} last={i === pinned.length - 1} />
                  ) : (
                    <MissingPinItem key={p.id} id={p.id} station={p.station} fuel={s.fuel} last={i === pinned.length - 1} />
                  ),
                )}
              </Card>
            </View>
          ) : null}

          {total === 0 ? (
            <Card style={{ gap: Spacing.three }}>
              <T>
                {s.pinnedOnly && !pins.length
                  ? 'No pinned stations yet. Swipe a station left to pin it.'
                  : `No stations match.${staleN && !s.showStale ? ` ${staleN} with older prices hidden.` : ''}`}
              </T>
              <Button label="Reset filters" kind="secondary" onPress={resetFilters} />
            </Card>
          ) : rows.length ? (
            <View style={{ gap: Spacing.two }}>
              {pinned.length ? <T kind="eyebrow">{home ? `Within ${s.radiusKm} km` : 'All stations'}</T> : null}
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {rows.slice(0, show).map((x, i, a) => (
                  <StationItem key={rowKey(x)} r={x} median={r?.now} sydney={sydney} last={i === a.length - 1} />
                ))}
              </Card>
            </View>
          ) : !s.pinnedOnly ? (
            <Card style={{ gap: Spacing.three }}>
              <T>No other stations match.</T>
              <Button label="Reset filters" kind="secondary" onPress={resetFilters} />
            </Card>
          ) : null}

          {rows.length > show ? (
            <Button label={`Show ${Math.min(PAGE, rows.length - show)} more`} kind="secondary" onPress={() => setShow(show + PAGE)} />
          ) : null}

          <Disclosure title="About “Fill by” dates">
            <T kind="small" color={c.fg2}>{WHEN_NOTE}</T>
          </Disclosure>

          {sheetEl}
          {toggle ? <View style={{ height: 56 }} /> : null}
        </>
      )}
    </Screen>
    {toggle ? (
      <View style={[styles.toggleWrap, { bottom: (Platform.OS === 'ios' ? insets.bottom + 50 : 0) + Spacing.four }]} pointerEvents="box-none">
        {toggle}
      </View>
    ) : null}
    </View>
  );
}

/** The floating Map / List button, like 18 Birdies: it names the view it switches to. The app's primary button colours. */
function ViewToggle({ view, onPress }: { view: 'list' | 'map'; onPress: () => void }) {
  const c = useTheme();
  const to = view === 'map' ? 'List' : 'Map';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={view === 'map' ? 'Show as a list' : 'Show on a map'}
      style={({ pressed }) => [styles.toggle, { backgroundColor: c.fg, opacity: pressed ? 0.85 : 1 }]}>
      {view === 'map' ? <ListIcon color={c.bg} size={20} /> : <MapIcon color={c.bg} size={20} />}
      <T color={c.bg} style={{ fontWeight: '800', fontSize: 16 }}>{to}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.input, padding: Spacing.four },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: 14, minHeight: 44 },
  mapHead: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.three },
  mapArea: { flex: 1, paddingVertical: 0, paddingHorizontal: Spacing.three, minHeight: 44, gap: 6 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.chip, minWidth: 44, minHeight: 44, paddingHorizontal: 12 },
  toggleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.chip, paddingHorizontal: 22, minHeight: 48,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
});
