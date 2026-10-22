import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AreaPicker } from '@/components/area-picker';
import { FilterSheet } from '@/components/filter-sheet';
import { FilterIcon } from '@/components/icons';
import { MissingPinItem, rowKey, StationItem } from '@/components/station-row';
import { Button, Card, Disclosure, Loading, Screen, StaleBanner, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useArea, useAreaLive } from '@/hooks/use-area';
import { useTheme } from '@/hooks/use-theme';
import { useForecast, useStations } from '@/lib/api';
import { WHEN_NOTE } from '@/lib/copy';
import { applyFilters, brandCounts, filterCount, pinnedRows } from '@/lib/filters';
import { fuelName, nice, refreshedText } from '@/lib/format';
import { areaName, rankStations } from '@/lib/geo';
import { usePins } from '@/lib/pins';
import { resetFilters, useSettings } from '@/lib/settings';

const PAGE = 30;

export default function Stations() {
  const c = useTheme();
  const s = useSettings();
  const home = useArea();
  const live = useAreaLive();
  const pins = usePins();
  const sq = useStations();
  const fq = useForecast();
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  // Paging resets whenever the list itself changes (fuel, area, sort or any filter)
  const sig = [s.fuel, home?.la, home?.lo, s.radiusKm, s.sort, s.members, s.showStale, s.brands.join(','), s.advice.join(','), s.maxPrice, s.pinnedOnly].join('|');
  const [page, setPage] = useState({ sig, n: PAGE });
  const show = page.sig === sig ? page.n : PAGE;
  const setShow = (n: number) => setPage({ sig, n });

  const data = sq.data;
  const ranked = useMemo(
    () => (data ? rankStations(data.stations, s.fuel, { home, radiusKm: s.radiusKm, members: s.members, sort: s.sort }) : []),
    [data, s.fuel, home, s.radiusKm, s.members, s.sort],
  );
  const brands = useMemo(() => (data ? brandCounts(data.stations, s.fuel) : []), [data, s.fuel]);
  const pinned = useMemo(() => (data ? pinnedRows(data.stations, s.fuel, pins, home) : []), [data, s.fuel, pins, home]);

  const pinSet = new Set(pins);
  const unpinned = (f: typeof s) => applyFilters(ranked, f).filter((x) => !pinSet.has(x.id));
  const filtered = unpinned(s);
  // How many more the "older prices" switch would add (shown in the sheet and the empty state)
  const staleN = unpinned({ ...s, showStale: true }).length - unpinned({ ...s, showStale: false }).length;
  const rows = s.pinnedOnly ? [] : filtered;
  const total = pinned.filter((p) => p.row).length + rows.length;   // greyed pins with no price don't count
  const nFilters = filterCount(s);

  const r = fq.data?.live.find((x) => x.fuel === s.fuel);
  const area = home && data ? areaName(home, data.suburbs, live) : null;
  const order = s.pinnedOnly ? 'pinned only' : `${home ? `within ${s.radiusKm} km, ` : ''}${home && s.sort === 'distance' ? 'nearest' : 'cheapest'} first`;

  return (
    <Screen
      title="Stations"
      subtitle={data ? `${fuelName(s.fuel)} · ${refreshedText(data.generated_at) || `prices from ${nice(data.asof)}`}` : 'Stations'}
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
            <Pressable
              onPress={() => setSheet(true)}
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
                    <StationItem key={p.id} r={p.row} median={r?.now} last={i === pinned.length - 1} />
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
                  <StationItem key={rowKey(x)} r={x} median={r?.now} last={i === a.length - 1} />
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

          <FilterSheet
            visible={sheet}
            onClose={() => setSheet(false)}
            brands={brands}
            staleCount={staleN}
            resultCount={total}
            hasHome={!!home}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  area: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.input, padding: Spacing.four },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: 14, minHeight: 44 },
});
