import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { DirectionsButton, PinButton } from '@/components/station-actions';
import { Badge, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStationDetail } from '@/lib/api';
import { STALE_DAYS } from '@/lib/filters';
import { brandSuburb, stationName, updatedText } from '@/lib/format';
import type { StationRow } from '@/lib/geo';
import type { Tone } from '@/lib/outlook';
import type { AdviceCode, Fuel, Station } from '@/lib/types';

export const ADVICE_TONE: Record<AdviceCode, Tone> = { now: 'act', by: 'act', wait: 'wait', hi: 'wait', any: 'calm', ok: 'calm', chk: 'calm' };

export { STALE_DAYS };


export const openStation = (id: string) => router.push({ pathname: '/station/[id]', params: { id } });

/** React key for a row; rows from an old cached stations.json have no id */
export const rowKey = (r: { id?: string; n: string; la: number; lo: number }) => r.id || `${r.n}|${r.la}|${r.lo}`;

const shortFuel = (f: Fuel) => (f === 'DL' ? 'Diesel' : f);

/** One station: price and gap to the median, name and where, the when-to-fill chip; pin and Directions buttons.
 *  Tapping the row opens the station page. */
export function StationItem({ r, median, last }: { r: StationRow; median: number | undefined; last?: boolean }) {
  const c = useTheme();
  const [, , code, label] = r.adv;
  const name = stationName(r.n);
  const gap = median != null ? r.price - median : null;
  const stale = r.age != null && r.age > STALE_DAYS;
  const hasId = !!r.id;   // an old cached stations.json has no ids: no station page and no pin, Directions still works

  return (
    <View style={[styles.outer, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Pressable
        onPress={hasId ? () => openStation(r.id) : undefined}
        disabled={!hasId}
        accessibilityRole={hasId ? 'button' : undefined}
        accessibilityLabel={`${name}, ${r.price.toFixed(1)} cents, ${label}`}
        accessibilityHint={hasId ? "Opens the station's prices and forecast" : undefined}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: c.sunk }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <T style={{ fontWeight: '700', fontSize: 15 }} color={c.fg} numberOfLines={1}>{name}</T>
          <T kind="small" numberOfLines={1}>
            {brandSuburb(name, r.b, r.s)}{r.d != null ? ` · ${r.d.toFixed(1)} km` : ''}{r.m ? ' · Members' : ''}
          </T>
          <View style={[styles.row, { gap: Spacing.two, marginTop: 2 }]}>
            <Badge tone={ADVICE_TONE[code] ?? 'calm'}>{label}</Badge>
            {stale ? <T kind="small" color={c.up} numberOfLines={1} style={{ flexShrink: 1 }}>{updatedText(r.age)}</T> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <T kind="bignum" style={{ fontSize: 22 }}>{r.price.toFixed(1)}</T>
          {gap != null ? (
            <T kind="small" color={gap < -0.05 ? c.cheap : gap > 0.05 ? c.dear : c.muted} style={{ fontWeight: '600' }}>
              {Math.abs(gap) < 0.05 ? 'at median' : `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}c`}
            </T>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        {hasId ? <PinButton id={r.id} name={name} /> : null}
        <DirectionsButton la={r.la} lo={r.lo} name={name} />
      </View>
    </View>
  );
}

/** A pinned station with no price for this fuel in today's data (doesn't sell it, or not in today's list): greyed
 *  out, still tappable and unpinnable. */
export function MissingPinItem({ id, station, fuel, last }: { id: string; station: Station | null; fuel: Fuel; last?: boolean }) {
  const c = useTheme();
  const dq = useStationDetail(station ? undefined : id);   // name lookup only if the station left today's list
  const name = stationName(station?.n ?? dq.data?.n ?? 'Pinned station');
  const where = station ? brandSuburb(name, station.b, station.s) : dq.data ? brandSuburb(name, dq.data.b, dq.data.s) : null;
  const why = station ? `No ${shortFuel(fuel)} here` : 'Not in today’s prices';
  return (
    <View style={[styles.outer, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Pressable
        onPress={() => openStation(id)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${why}`}
        style={({ pressed }) => [styles.item, { opacity: 0.6 }, pressed && { backgroundColor: c.sunk }]}>
        <View style={{ flex: 1, gap: 3 }}>
          <T style={{ fontWeight: '700', fontSize: 15 }} color={c.fg} numberOfLines={1}>{name}</T>
          {where ? <T kind="small" numberOfLines={1}>{where}</T> : null}
        </View>
        <T kind="small" style={{ fontWeight: '600' }}>{why}</T>
      </Pressable>
      <View style={styles.actions}>
        <PinButton id={id} name={name} />
        {station ? <DirectionsButton la={station.la} lo={station.lo} name={name} /> : <View style={styles.spacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flexDirection: 'row', alignItems: 'center' },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingLeft: Spacing.four, paddingRight: Spacing.two },
  actions: { flexDirection: 'row', alignItems: 'center', paddingRight: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  spacer: { width: 44, height: 44 },
});
