import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { MapPinIcon, PinIcon } from '@/components/icons';
import { notify, PINS_FULL } from '@/components/station-actions';
import { Badge, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStationDetail } from '@/lib/api';
import { openInMaps } from '@/lib/directions';
import { offText } from '@/lib/discounts';
import { STALE_DAYS } from '@/lib/filters';
import { togglePin, usePins } from '@/lib/pins';
import { echoesSydney } from '@/lib/copy';
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

/** Sideways travel (dp, counted from the first touch) before a drag on a row becomes a swipe. The list's
 *  gesture-handler ScrollView (ui.tsx Screen) cancels a row's pending swipe once it starts scrolling; this threshold
 *  makes a diagonal start favour the scroll too. A deliberate swipe covers it in a few frames. */
const SWIPE_START = 24;

/** Swipe left on a row for Pin/Unpin and Map (the station on the map, not navigation). Screen readers get the same two as custom actions on the row. */
function SwipeRow({ id, name, la, lo, children }: { id?: string; name: string; la?: number; lo?: number; children: (a11y: A11y) => ReactNode }) {
  const c = useTheme();
  const pinned = usePins().includes(id ?? '');
  const canGo = la != null && lo != null;
  const pin = () => {
    if (id && !togglePin(id)) notify(PINS_FULL);
  };
  const go = () => {
    if (canGo) openInMaps(la, lo, name);
  };
  const then = (m: SwipeableMethods, f: () => void) => () => {
    m.close();
    f();
  };
  const a11y: A11y = {
    accessibilityActions: [
      ...(id ? [{ name: 'pin', label: pinned ? 'Unpin' : 'Pin' }] : []),
      ...(canGo ? [{ name: 'map', label: 'Show on map' }] : []),
    ],
    onAccessibilityAction: (e) => (e.nativeEvent.actionName === 'pin' ? pin() : e.nativeEvent.actionName === 'map' ? go() : undefined),
  };
  return (
    <Swipeable
      friction={2}
      rightThreshold={40}
      // Let vertical scrolling win: a swipe needs SWIPE_START dp sideways (default 10), so only a clearly horizontal
      // drag becomes one
      dragOffsetFromRight={-SWIPE_START}
      dragOffsetFromLeft={SWIPE_START}
      overshootRight={false}
      renderRightActions={(_p, _t, m) => (
        // Hidden from screen readers: the row's own accessibilityActions offer Pin and Show on map
        <View style={styles.swipe} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {id ? (
            <Pressable onPress={then(m, pin)} accessibilityRole="button" accessibilityLabel={pinned ? `Unpin ${name}` : `Pin ${name}`} style={[styles.swipeBtn, { backgroundColor: c.chip }]}>
              <PinIcon filled={!pinned} color={c.onChip} size={20} />
              <T kind="small" color={c.onChip} style={{ fontWeight: '700' }}>{pinned ? 'Unpin' : 'Pin'}</T>
            </Pressable>
          ) : null}
          {canGo ? (
            <Pressable onPress={then(m, go)} accessibilityRole="button" accessibilityLabel={`Show ${name} on the map`} style={[styles.swipeBtn, { backgroundColor: c.tgp }]}>
              <MapPinIcon color="#ffffff" size={22} />
              <T kind="small" color="#ffffff" style={{ fontWeight: '700' }}>Map</T>
            </Pressable>
          ) : null}
        </View>
      )}>
      {children(a11y)}
    </Swipeable>
  );
}

type A11y = Pick<PressableProps, 'accessibilityActions' | 'onAccessibilityAction'>;

/** One station: name, where, the when-to-fill chip, price and gap to the median. Tapping opens the station page;
 *  swiping left shows Pin and Map. A pinned station shows a small pin by its name. */
export function StationItem({ r, median, sydney, last }: { r: StationRow; median: number | undefined; sydney?: Tone; last?: boolean }) {
  const c = useTheme();
  const [, , code, label] = r.adv;
  const name = stationName(r.n);
  const gap = median != null ? r.price - median : null;
  const stale = r.age != null && r.age > STALE_DAYS;
  const hasId = !!r.id;   // an old cached stations.json has no ids: no station page and no pin, Map still works
  const pinned = usePins().includes(r.id);
  const quiet = echoesSydney(code, sydney);

  return (
    <View style={[styles.outer, { backgroundColor: c.surface }, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <SwipeRow id={hasId ? r.id : undefined} name={name} la={r.la} lo={r.lo}>
        {(a11y) => (
          <Pressable
            onPress={hasId ? () => openStation(r.id) : undefined}
            disabled={!hasId}
            accessibilityRole={hasId ? 'button' : undefined}
            accessibilityLabel={`${name}${pinned ? ', pinned' : ''}, ${r.price.toFixed(1)} cents${r.off ? ` with your ${offText(r.off)} off, pump price ${r.pump.toFixed(1)}` : ''}, ${label}`}
            accessibilityHint={hasId ? "Opens the station’s prices and forecast" : undefined}
            {...a11y}
            style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.sunk : c.surface }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={[styles.row, { gap: 6 }]}>
                <T style={{ fontWeight: '700', fontSize: 15, flexShrink: 1 }} color={c.fg} numberOfLines={1}>{name}</T>
                {pinned ? <PinIcon filled color={c.muted} size={14} /> : null}
              </View>
              <T kind="small" numberOfLines={1}>
                {brandSuburb(name, r.b, r.s)}{r.d != null ? ` · ${r.d.toFixed(1)} km` : ''}{r.m ? ' · Members' : ''}
              </T>
              {!quiet || r.off || stale ? (
                <View style={[styles.row, { gap: Spacing.two, marginTop: 2 }]}>
                  {!quiet ? <Badge tone={ADVICE_TONE[code] ?? 'calm'}>{label}</Badge> : null}
                  {r.off ? <OffTag off={r.off} /> : null}
                  {stale ? <T kind="small" color={c.up} numberOfLines={1} style={{ flexShrink: 1 }}>{updatedText(r.age)}</T> : null}
                </View>
              ) : null}
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
        )}
      </SwipeRow>
    </View>
  );
}

/** "4c off": your discount at this station's brand, beside the advice chip (the price shown already includes it) */
export function OffTag({ off }: { off: number }) {
  const c = useTheme();
  return (
    <View style={[styles.off, { borderColor: c.cheap }]}>
      <Text style={{ color: c.cheap, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{offText(off)} off</Text>
    </View>
  );
}

/** A pinned station with no price for this fuel in today's data (doesn't sell it, or not in today's list): greyed
 *  out, still tappable; swipe to unpin. */
export function MissingPinItem({ id, station, fuel, last }: { id: string; station: Station | null; fuel: Fuel; last?: boolean }) {
  const c = useTheme();
  const dq = useStationDetail(station ? undefined : id);   // name lookup only if the station left today's list
  const name = stationName(station?.n ?? dq.data?.n ?? 'Pinned station');
  const where = station ? brandSuburb(name, station.b, station.s) : dq.data ? brandSuburb(name, dq.data.b, dq.data.s) : null;
  const why = station ? `No ${shortFuel(fuel)} here` : 'Not in today’s prices';
  return (
    <View style={[styles.outer, { backgroundColor: c.surface }, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <SwipeRow id={id} name={name} la={station?.la} lo={station?.lo}>
        {(a11y) => (
          <Pressable
            onPress={() => openStation(id)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, pinned, ${why}`}
            {...a11y}
            style={({ pressed }) => [styles.item, { backgroundColor: pressed ? c.sunk : c.surface }]}>
            <View style={{ flex: 1, gap: 3, opacity: 0.6 }}>
              <View style={[styles.row, { gap: 6 }]}>
                <T style={{ fontWeight: '700', fontSize: 15, flexShrink: 1 }} color={c.fg} numberOfLines={1}>{name}</T>
                <PinIcon filled color={c.muted} size={14} />
              </View>
              {where ? <T kind="small" numberOfLines={1}>{where}</T> : null}
            </View>
            <T kind="small" style={{ fontWeight: '600', opacity: 0.6 }}>{why}</T>
          </Pressable>
        )}
      </SwipeRow>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {},
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
  swipe: { flexDirection: 'row' },
  swipeBtn: { width: 76, alignItems: 'center', justifyContent: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  off: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
});
