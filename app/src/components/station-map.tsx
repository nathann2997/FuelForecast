import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Supercluster from 'supercluster';

import { LocateIcon, MapPinIcon, PinIcon } from '@/components/icons';
import { notify, PINS_FULL } from '@/components/station-actions';
import { ADVICE_TONE, OffTag, openStation } from '@/components/station-row';
import { Badge, T } from '@/components/ui';
import { Colors, Radius, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openInMaps } from '@/lib/directions';
import { offText } from '@/lib/discounts';
import { STALE_DAYS } from '@/lib/filters';
import { brandSuburb, stationName, updatedText } from '@/lib/format';
import type { Place, StationRow } from '@/lib/geo';
import {
  areaMoved, bboxOf, brandLabel, inBox, lonSpanAt, padBox, priceTiers, regionFor, SYDNEY, zoomOf, type Region, type Tier,
} from '@/lib/map';
import { togglePin, usePins } from '@/lib/pins';

// The Stations tab's map view, like NSW FuelCheck: every station on screen as a price tag, loaded as you pan and zoom,
// grouped into numbered circles when zoomed out. Tags are coloured by the cheapest, middle and dearest third of the
// stations in view. Tapping a tag opens a card over the bottom of the map with the price, the when-to-fill call and
// directions. Google Maps on Android, Apple Maps on iOS (no key needed there).
//
// Android draws each marker as a picture, and only reliably redraws it when the marker is added (react-native-maps'
// tracksViewChanges skips colour-only changes). So a tag whose look changes (colour, price, selection, theme) is keyed
// by that look and comes back as a new marker; the first moment after it mounts, it tracks its view so text is drawn.
//
// Privacy: the blue "you" dot is drawn from Bowser's own fix (the area), not the map SDK's location layer, so the map
// library never reads the phone's position. Google still serves the tiles for the area on screen.

type Props = {
  rows: StationRow[];              // every station for the fuel, filters applied (pinned ones left out); the map shows those in view
  pinned: StationRow[];            // pinned stations with a price, always shown
  footer?: ReactNode;              // the Map / List toggle, floating at the bottom of the map
  home: Place | null;
  live: boolean | null;            // false: the phone can't locate now, so `home` is only the last known fix
  radiusKm: number;                // the list's radius: how far the map shows when it opens
  median: number | undefined;
};

/** Clustering stops at this zoom (about a suburb across a phone screen): past it every station has its own tag */
const CLUSTER_MAX_ZOOM = 13;
/** Room at the bottom of the map for the toggle; the Google logo sits above it */
const TOGGLE_ROOM = 72;

export function StationMap({ rows, pinned, footer, home, live, radiusKm, median }: Props) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const ref = useRef<MapView>(null);
  const start = useMemo(() => regionFor(home ?? SYDNEY, home ? radiusKm : 12), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [region, setRegion] = useState<Region>(start);
  const [width, setWidth] = useState(360);   // dp, for the zoom level
  const [selected, setSelected] = useState<string | null>(null);
  const [cardH, setCardH] = useState(0);

  const all = useMemo(() => [...pinned, ...rows], [pinned, rows]);
  const pinIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const sel = selected ? all.find((r) => r.id === selected) ?? null : null;
  if (selected && !sel) setSelected(null);   // it left the map (fuel or filter change): don't reopen if it comes back

  // What's on screen: the count uses the exact view; tags load a little past the edges so they don't pop in and out
  const box = useMemo(() => bboxOf(region), [region]);
  const inView = useMemo(() => all.filter((r) => inBox(box, r.la, r.lo)), [all, box]);
  const zoom = zoomOf(region, width);

  // Colours: thirds of the stations in view, recomputed only after a real move (a zoom of most of a level, or a pan of
  // over a third of the screen), so tags don't change colour on a nudge or when a tapped tag is centred
  const [tierRegion, setTierRegion] = useState<Region>(start);
  const ownMove = useRef(false);
  const onRegion = (r: Region) => {
    setRegion(r);
    if (ownMove.current) {
      ownMove.current = false;
      return;
    }
    const t = tierRegion;
    const moved =
      Math.abs(zoomOf(r, width) - zoomOf(t, width)) > 0.75 ||
      Math.abs(r.latitude - t.latitude) > t.latitudeDelta / 3 ||
      Math.abs(r.longitude - t.longitude) > t.longitudeDelta / 3;
    if (moved) setTierRegion(r);
  };
  const tierOf = useMemo(() => {
    const b = bboxOf(tierRegion);
    return priceTiers(all.filter((r) => inBox(b, r.la, r.lo)).map((r) => r.price));
  }, [all, tierRegion]);

  const index = useMemo(() => {
    // 60 of supercluster's 512 = 30 dp at Google's zoom: only tags that would sit on top of each other merge
    const sc = new Supercluster<{ id: string }>({ radius: 60, maxZoom: CLUSTER_MAX_ZOOM });
    sc.load(rows.map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: [r.lo, r.la] } })));
    return sc;
  }, [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const clusters = useMemo(() => index.getClusters(padBox(box, 0.15, 0.25), Math.floor(zoom)), [index, box, zoom]);

  const goHome = () => {
    if (home) ref.current?.animateToRegion(regionFor(home, radiusKm), 350);
  };
  // Follow the area when the radius changes or the area really moves (a new suburb, a drive), not on every GPS
  // refresh: useArea re-reads the fix on each focus, and a small jitter shouldn't pull a panned map back
  const followed = useRef({ home, radiusKm });
  useEffect(() => {
    const f = followed.current;
    if (!areaMoved(f.home, home, radiusKm) && f.radiusKm === radiusKm) return;
    followed.current = { home, radiusKm };
    goHome();
  }, [home, radiusKm]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A tapped tag is centred in the map above the card, once the card has its height (the map's bottom padding follows it)
  useEffect(() => {
    if (!sel || !cardH) return;
    ownMove.current = true;
    ref.current?.animateCamera({ center: { latitude: sel.la, longitude: sel.lo } }, { duration: 250 });
    const t = setTimeout(() => (ownMove.current = false), 800);   // already centred: no move comes to clear it
    return () => clearTimeout(t);
  }, [selected, cardH]);   // eslint-disable-line react-hooks/exhaustive-deps

  const zoomInto = useCallback((id: number, la: number, lo: number) => {
    const z = Math.min(index.getClusterExpansionZoom(id), CLUSTER_MAX_ZOOM + 1) + 0.3;
    if (Platform.OS === 'android') {
      ref.current?.animateCamera({ center: { latitude: la, longitude: lo }, zoom: z }, { duration: 300 });
    } else {
      // Apple Maps cameras use altitude, not zoom: ask for the span instead, kept wide rather than tall
      const d = lonSpanAt(z, width);
      ref.current?.animateToRegion({ latitude: la, longitude: lo, latitudeDelta: d / 3, longitudeDelta: d }, 300);
    }
  }, [index, width]);

  const n = inView.length;
  const iosTabs = Platform.OS === 'ios' ? insets.bottom + 50 : 0;
  const open = !!sel;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.info, { borderBottomColor: c.line, backgroundColor: c.bg }]}>
        <T kind="small" style={{ flex: 1 }} numberOfLines={1}>
          {n ? `${n} station${n === 1 ? '' : 's'} in view` : 'No stations in view. Zoom out or change filters.'}
        </T>
        <MapLegend />
      </View>

      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <MapView
          ref={ref}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={start}
          onRegionChangeComplete={onRegion}
          onPress={(e) => e.nativeEvent.action !== 'marker-press' && setSelected(null)}
          customMapStyle={dark ? DARK_STYLE : LIGHT_STYLE}
          userInterfaceStyle={dark ? 'dark' : 'light'}
          showsPointsOfInterests={false}
          showsUserLocation={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
          rotateEnabled={false}
          pitchEnabled={false}
          // The Google logo and the centre of the map sit above whatever covers the bottom: the toggle, or the card
          mapPadding={{ top: 0, right: 0, bottom: open && cardH ? cardH : TOGGLE_ROOM + iosTabs, left: 0 }}>
          {home?.gps && live !== false ? <MeMarker key={`me${c.bg}`} home={home} c={c} /> : null}
          {clusters.map((f) => {
            const [lo, la] = f.geometry.coordinates;
            if ('cluster' in f.properties && f.properties.cluster) {
              const { point_count: count, cluster_id: id } = f.properties;
              return <ClusterMarker key={`c${id}|${count}|${c.bg}`} id={id} la={la} lo={lo} count={count} c={c} onPress={zoomInto} />;
            }
            const r = byId.get((f.properties as { id: string }).id);
            if (!r) return null;
            const tier = tierOf(r.price);
            const isSel = r.id === selected;
            return <PriceMarker key={`${r.id}|${tier}|${isSel}|${r.price}|${c.bg}`} r={r} tier={tier} selected={isSel} pinned={false} c={c} onPress={setSelected} />;
          })}
          {pinned.map((r) => {
            const tier = tierOf(r.price);
            const isSel = r.id === selected;
            return <PriceMarker key={`p${r.id}|${tier}|${isSel}|${r.price}|${c.bg}`} r={r} tier={tier} selected={isSel} pinned c={c} onPress={setSelected} />;
          })}
        </MapView>

        {home && !open ? (
          <Pressable
            onPress={goHome}
            accessibilityRole="button"
            accessibilityLabel={home.gps ? 'Centre on you' : 'Centre on your area'}
            style={({ pressed }) => [styles.roundBtn, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <LocateIcon color={c.fg} size={22} />
          </Pressable>
        ) : null}

        {!open ? (
          <View style={[styles.bottom, { bottom: Spacing.four + iosTabs }]} pointerEvents="box-none">
            {footer}
          </View>
        ) : null}

        {sel ? (
          <StationCard
            r={sel}
            pinned={pinIds.has(sel.id)}
            median={median}
            onClose={() => setSelected(null)}
            bottom={iosTabs}
            onHeight={setCardH}
          />
        ) : null}
      </View>
    </View>
  );
}

// ---- Pieces

/** Price text on a tier colour: white on the light theme's deep fills, dark on the dark theme's bright ones (contrast) */
const tierColors = (c: Palette, t: Tier) => {
  const on = c.bg === Colors.dark.bg ? c.onChip : '#ffffff';
  return t === 'low' ? { bg: c.cheap, fg: on } : t === 'high' ? { bg: c.dear, fg: on } : { bg: c.chip, fg: c.onChip };
};

/** True for a moment after mount, so Android draws the marker's view (text included) before it stops tracking it */
function useFirstPaint() {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(t);
  }, []);
  return tracking;
}

/** One station's price tag: the price on its colour, the brand below; pinned ones have a dark outline and a pin */
const PriceMarker = memo(function PriceMarker({
  r, tier, selected, pinned, c, onPress,
}: { r: StationRow; tier: Tier; selected: boolean; pinned: boolean; c: Palette; onPress: (id: string) => void }) {
  const tracking = useFirstPaint();
  const col = tierColors(c, tier);
  const name = stationName(r.n);
  const edge = selected || pinned ? c.fg : c.line;
  return (
    <Marker
      coordinate={{ latitude: r.la, longitude: r.lo }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 30 : pinned ? 20 : tier === 'low' ? 12 : tier === 'mid' ? 11 : 10}   // cheaper on top where they overlap
      onPress={() => onPress(r.id)}
      accessibilityLabel={`${name}, ${r.price.toFixed(1)} cents${pinned ? ', pinned' : ''}`}>
      {/* Selection is a thicker outline, not a scale: Android draws the marker at its layout size, so a scaled tag is clipped */}
      <View style={styles.tagWrap}>
        <View style={[styles.tag, { backgroundColor: c.surface, borderColor: edge, borderWidth: selected ? 3 : pinned ? 2 : 1 }]}>
          <View style={[styles.tagPrice, { backgroundColor: col.bg }]}>
            <Text style={[styles.tagPriceText, { color: col.fg }]}>{r.price.toFixed(1)}</Text>
          </View>
          <View style={styles.tagBrand}>
            {pinned ? <PinIcon filled color={c.fg} size={11} /> : null}
            <Text style={[styles.tagBrandText, { color: c.fg2 }]} numberOfLines={1}>{brandLabel(r.b)}</Text>
          </View>
        </View>
        <View style={[styles.tagPoint, { borderTopColor: edge }]} />
      </View>
    </Marker>
  );
});

/** A group of stations too close to show apart at this zoom: the count, in the app's primary colours (not blue, so it
 *  can't be taken for the "you" dot). Tapping zooms in until it splits. */
const ClusterMarker = memo(function ClusterMarker({
  id, la, lo, count, c, onPress,
}: { id: number; la: number; lo: number; count: number; c: Palette; onPress: (id: number, la: number, lo: number) => void }) {
  const tracking = useFirstPaint();
  const size = count < 10 ? 36 : count < 50 ? 42 : 48;
  return (
    <Marker
      coordinate={{ latitude: la, longitude: lo }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={5}
      onPress={() => onPress(id, la, lo)}
      accessibilityLabel={`${count} stations. Zoom in`}>
      <View style={styles.clusterWrap}>
        <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.fg, borderColor: c.bg }]}>
          <Text style={[styles.clusterText, { color: c.bg }]}>{count}</Text>
        </View>
      </View>
    </Marker>
  );
});

/** Where you are: a small blue dot with a halo, drawn from Bowser's own fix */
function MeMarker({ home, c }: { home: Place; c: Palette }) {
  const tracking = useFirstPaint();
  return (
    <Marker coordinate={{ latitude: home.la, longitude: home.lo }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} zIndex={1} accessibilityLabel="You">
      <View style={styles.meRing}><View style={[styles.meDot, { backgroundColor: c.tgp }]} /></View>
    </Marker>
  );
}

/** Cheaper ● ● ● Dearer: what the tag colours mean */
export function MapLegend() {
  const c = useTheme();
  return (
    <View
      style={styles.legend}
      accessible
      accessibilityLabel="Price colours: green is the cheapest third of the stations in view, amber the middle, red the dearest third">
      <Text style={[styles.legendText, { color: c.muted }]}>Cheaper</Text>
      {(['low', 'mid', 'high'] as const).map((t) => (
        <View key={t} style={[styles.legendDot, { backgroundColor: tierColors(c, t).bg }]} />
      ))}
      <Text style={[styles.legendText, { color: c.muted }]}>Dearer</Text>
    </View>
  );
}

/** The tapped station, over the bottom of the map like the app's sheets: name, price, the when-to-fill call and the
 *  7-day forecast in one line, then Directions, Pin and Details. The full forecast is on the station page. */
function StationCard({
  r, pinned, median, onClose, bottom, onHeight,
}: { r: StationRow; pinned: boolean; median: number | undefined; onClose: () => void; bottom: number; onHeight: (h: number) => void }) {
  const c = useTheme();
  usePins();   // re-render when this station is pinned or unpinned from the card
  const [, , code, label, , fc7] = r.adv;
  const name = stationName(r.n);
  const gap = median != null ? r.price - median : null;
  const stale = r.age != null && r.age > STALE_DAYS;
  const fcDelta = fc7 != null ? fc7 - r.pump : null;
  const pin = () => {
    if (!togglePin(r.id)) notify(PINS_FULL);
  };

  return (
    <View
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.line, paddingBottom: Spacing.four + bottom }]}>
      <View style={styles.cardHead}>
        <Pressable
          onPress={() => openStation(r.id)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${r.price.toFixed(1)} cents${r.off ? ` with your ${offText(r.off)} off` : ''}, ${label}`}
          accessibilityHint="Opens the station’s prices and forecast"
          style={{ flex: 1, gap: 2 }}>
          <T style={{ fontWeight: '700', fontSize: 16 }} color={c.fg} numberOfLines={1}>{name}</T>
          <T kind="small" numberOfLines={1} color={stale ? c.up : undefined}>
            {stale ? updatedText(r.age) : `${brandSuburb(name, r.b, r.s)}${r.d != null ? ` · ${r.d.toFixed(1)} km` : ''}${r.m ? ' · Members' : ''}`}
          </T>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          <T kind="bignum">{r.price.toFixed(1)}</T>
          {gap != null ? (
            <T kind="small" color={gap < -0.05 ? c.cheap : gap > 0.05 ? c.dear : c.muted} style={{ fontWeight: '600' }}>
              {Math.abs(gap) < 0.05 ? 'at median' : `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1)}c vs median`}
            </T>
          ) : null}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.cardClose}>
          <T color={c.muted} style={{ fontSize: 18 }}>✕</T>
        </Pressable>
      </View>

      <View style={styles.cardChips}>
        <Badge tone={ADVICE_TONE[code] ?? 'calm'}>{label}</Badge>
        {r.off ? <OffTag off={r.off} /> : null}
        {fcDelta != null ? (
          <T kind="small" color={c.fg2} numberOfLines={1} style={{ flexShrink: 1 }}>
            7 days: ~{fc7!.toFixed(1)}{Math.abs(fcDelta) >= 0.5 ? ` (${fcDelta > 0 ? '+' : '−'}${Math.abs(fcDelta).toFixed(1)}c)` : ''}
          </T>
        ) : null}
      </View>

      <View style={styles.cardActions}>
        <CardButton label="Directions" onPress={() => openInMaps(r.la, r.lo, name)} c={c} primary icon={<MapPinIcon color={c.bg} size={18} />} />
        <CardButton label={pinned ? 'Unpin' : 'Pin'} onPress={pin} c={c} icon={<PinIcon filled={!pinned} color={c.fg} size={16} />} />
        <CardButton label="Details" onPress={() => openStation(r.id)} c={c} />
      </View>
    </View>
  );
}

function CardButton({ label, onPress, c, primary, icon }: { label: string; onPress: () => void; c: Palette; primary?: boolean; icon?: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.cardBtn,
        { flex: primary ? 1.4 : 1, backgroundColor: primary ? c.fg : c.surface, borderColor: primary ? c.fg : c.line, opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon}
      <Text style={{ color: primary ? c.bg : c.fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

// ---- Google map styles (Android). Business places are hidden so Google's own petrol-station icons don't sit under
// the price tags; the dark one follows the app's dark palette.
const LIGHT_STYLE: MapStyleElement[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -60 }, { lightness: 20 }] },
];

const DARK_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#1b1e22' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8b9197' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#121417' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2e33' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#20242a' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2a22' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3137' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212529' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4047' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a6abb0' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#262a30' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a26' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d8c' }] },
];

const styles = StyleSheet.create({
  tagWrap: { alignItems: 'center', padding: 2 },
  tag: { borderRadius: 10, overflow: 'hidden', minWidth: 62, alignItems: 'stretch' },
  tagPrice: { paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  tagPriceText: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tagBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  tagBrandText: { fontSize: 10, fontWeight: '700', maxWidth: 76 },
  tagPoint: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  clusterWrap: { padding: 2 },
  cluster: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  clusterText: { fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] },
  meRing: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(42,120,214,0.25)', alignItems: 'center', justifyContent: 'center' },
  meDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#ffffff' },
  info: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  roundBtn: {
    position: 'absolute', top: Spacing.three, right: Spacing.four,
    width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, fontWeight: '700' },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  // Over the bottom of the map like the app's sheets (ui.tsx Sheet); the map's bottom padding follows its height
  card: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: Radius.card, borderTopRightRadius: Radius.card, borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four, gap: Spacing.three,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  cardClose: { paddingLeft: Spacing.one, paddingTop: 2 },
  cardChips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  cardActions: { flexDirection: 'row', gap: Spacing.two },
  cardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.chip, minHeight: 44 },
});
