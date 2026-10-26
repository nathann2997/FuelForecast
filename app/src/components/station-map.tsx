import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Supercluster from 'supercluster';

import { MapPinIcon, PinIcon } from '@/components/icons';
import { notify, PINS_FULL } from '@/components/station-actions';
import { ADVICE_TONE, OffTag, openStation } from '@/components/station-row';
import { Badge, T } from '@/components/ui';
import { Radius, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { openInMaps } from '@/lib/directions';
import { offText } from '@/lib/discounts';
import { STALE_DAYS } from '@/lib/filters';
import { brandSuburb, stationName, updatedText } from '@/lib/format';
import type { Place, StationRow } from '@/lib/geo';
import { areaMoved, bboxOf, brandLabel, offerSearch, regionFor, SYDNEY, zoomOf, type Region, type Tier } from '@/lib/map';
import { togglePin, usePins } from '@/lib/pins';

// The Stations tab's map view: a price tag per station, coloured cheapest to dearest third of the stations on the map,
// grouped into numbered circles when zoomed out. Tapping a tag opens a card with the price, the when-to-fill call and
// directions. Google Maps on Android, Apple Maps on iOS (no key needed there).
//
// Privacy: the blue "you" dot is drawn from Bowser's own fix (the area), not the map SDK's location layer, so the map
// library never reads the phone's position. Google still serves the tiles for the area on screen.

type Props = {
  rows: StationRow[];              // the stations in the area, filters applied (pinned ones left out)
  pinned: StationRow[];            // pinned stations with a price, shown whatever the radius and filters
  tierOf: (price: number) => Tier; // pin colour, from the prices in the area (lib/map.ts priceTiers)
  footer?: ReactNode;              // the Map / List toggle, kept just above the station card
  home: Place | null;
  live: boolean | null;            // false: the phone can't locate now, so `home` is only the last known fix
  centre: Place | null;            // where the map last searched; null = the area (home)
  radiusKm: number;
  onSearch: (p: Place | null) => void;   // a new search centre, or null for back to the area
  median: number | undefined;
};

/** Clustering stops at this zoom: past it every station shows its own tag */
const CLUSTER_MAX_ZOOM = 15;

export function StationMap({ rows, pinned, tierOf, footer, home, live, centre, radiusKm, onSearch, median }: Props) {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const ref = useRef<MapView>(null);
  const area = centre ?? home;
  const start = useMemo(() => regionFor(area ?? SYDNEY, area ? radiusKm : 12), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [region, setRegion] = useState<Region>(start);
  const [selected, setSelected] = useState<string | null>(null);

  const all = useMemo(() => [...pinned, ...rows], [pinned, rows]);
  const pinIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const sel = selected ? all.find((r) => r.id === selected) ?? null : null;   // null once it leaves the map (fuel or filter change)

  const index = useMemo(() => {
    const sc = new Supercluster<{ id: string }>({ radius: 120, maxZoom: CLUSTER_MAX_ZOOM });   // 120 of a 512 tile ≈ 60 dp, about a tag's width
    sc.load(rows.map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Point', coordinates: [r.lo, r.la] } })));
    return sc;
  }, [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const clusters = useMemo(() => index.getClusters(bboxOf(region), Math.floor(zoomOf(region))), [index, region]);

  const goTo = (p: Place, km = radiusKm) => ref.current?.animateToRegion(regionFor(p, km), 350);
  // Follow the area when the radius changes or the area really moves (a new suburb, a drive), not on every GPS
  // refresh: useArea re-reads the fix on each focus, and a small jitter shouldn't pull a panned map back
  const followed = useRef({ home, radiusKm });
  useEffect(() => {
    const f = followed.current;
    if (!areaMoved(f.home, home, radiusKm) && f.radiusKm === radiusKm) return;
    followed.current = { home, radiusKm };
    if (!centre && home) goTo(home);
  }, [home, radiusKm]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A tapped tag in the lower half would sit under the card: move the map so it shows a third of the way down
  // (stable, through refs, so the memoised tags don't all re-render on every pan)
  const latest = useRef({ all, region });
  useEffect(() => {
    latest.current = { all, region };
  }, [all, region]);
  const select = useCallback((id: string) => {
    setSelected(id);
    const { all: rows, region: rg } = latest.current;
    const r = rows.find((x) => x.id === id);
    if (r && r.la < rg.latitude) {
      ref.current?.animateToRegion({ ...rg, latitude: r.la - rg.latitudeDelta * 0.15, longitude: r.lo }, 250);
    }
  }, []);

  const search = () => {
    const p: Place = { label: 'this area', la: region.latitude, lo: region.longitude };
    setSelected(null);
    onSearch(p);
    track('map.searched');
  };
  const back = () => {
    setSelected(null);
    onSearch(null);
    if (home) goTo(home);
  };
  const canSearch = offerSearch(area ?? SYDNEY, region, radiusKm);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={start}
        onRegionChangeComplete={setRegion}
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
        mapPadding={{ top: 56, right: 0, bottom: 80, left: 0 }}>   {/* fixed: a padding change moves the camera on Android */}
        {area ? (
          <Circle
            center={{ latitude: area.la, longitude: area.lo }}
            radius={radiusKm * 1000}
            strokeColor={c.tgp}
            strokeWidth={1.5}
            fillColor={dark ? 'rgba(57,135,229,0.06)' : 'rgba(42,120,214,0.05)'}
          />
        ) : null}
        {home?.gps && live !== false ? (
          <Marker key={`me${c.tgp}`} coordinate={{ latitude: home.la, longitude: home.lo }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={1} accessibilityLabel="You">
            <View style={styles.meRing}><View style={[styles.meDot, { backgroundColor: c.tgp }]} /></View>
          </Marker>
        ) : null}
        {clusters.map((f) => {
          const [lo, la] = f.geometry.coordinates;
          if ('cluster' in f.properties && f.properties.cluster) {
            const n = f.properties.point_count;
            const id = f.properties.cluster_id;
            return (
              <Marker
                // Android keeps a marker's first picture while tracksViewChanges is off, and supercluster reuses ids
                // across filter changes: the count and colour in the key make a changed bubble a new marker
                key={`c${id}-${n}-${c.tgp}`}
                coordinate={{ latitude: la, longitude: lo }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
                accessibilityLabel={`${n} stations. Zoom in`}
                onPress={() => {
                  // Half a level past where it splits: the region Google reports back can be a hair wider than asked
                  const z = Math.min(index.getClusterExpansionZoom(id), CLUSTER_MAX_ZOOM + 1) + 0.5;
                  const d = 360 / 2 ** z;
                  ref.current?.animateToRegion({ latitude: la, longitude: lo, latitudeDelta: d * 0.8, longitudeDelta: d }, 300);
                }}>
                <ClusterBubble n={n} c={c} />
              </Marker>
            );
          }
          const r = byId.get((f.properties as { id: string }).id);
          return r ? <PriceMarker key={r.id} r={r} tier={tierOf(r.price)} selected={r.id === selected} pinned={false} c={c} onPress={select} /> : null;
        })}
        {pinned.map((r) => (
          <PriceMarker key={`p${r.id}`} r={r} tier={tierOf(r.price)} selected={r.id === selected} pinned c={c} onPress={select} />
        ))}
      </MapView>

      {/* Search this area, or back to the area after a search */}
      <View style={styles.topChips} pointerEvents="box-none">
        {canSearch ? (
          <FloatChip label="Search this area" onPress={search} c={c} strong />
        ) : centre ? (
          <FloatChip label={home ? '‹ Back to near you' : '‹ Back to all stations'} onPress={back} c={c} />
        ) : null}
      </View>

      <View style={styles.side} pointerEvents="box-none">
        {home ? (
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel={home.gps ? 'Centre on you' : 'Centre on your area'}
            style={({ pressed }) => [styles.roundBtn, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.7 : 1 }]}>
            <Text style={{ color: c.tgp, fontSize: 20, lineHeight: 22 }}>◎</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.bottom, { bottom: (Platform.OS === 'ios' ? insets.bottom + 50 : 0) + Spacing.three }]} pointerEvents="box-none">
        {footer}
        {sel ? <StationCard r={sel} pinned={pinIds.has(sel.id)} median={median} tier={tierOf(sel.price)} onClose={() => setSelected(null)} /> : null}
      </View>
    </View>
  );
}

// ---- Pieces

const tierColors = (c: Palette, t: Tier) =>
  t === 'low' ? { bg: c.cheap, fg: '#ffffff' } : t === 'high' ? { bg: c.dear, fg: '#ffffff' } : { bg: c.chip, fg: c.onChip };

/**
 * One station's price tag. Android redraws a custom marker view on every map frame while tracksViewChanges is on, so
 * it is on only for a moment after the tag's look changes (first paint, colour, selection, pin), then off.
 */
const PriceMarker = memo(function PriceMarker({
  r, tier, selected, pinned, c, onPress,
}: { r: StationRow; tier: Tier; selected: boolean; pinned: boolean; c: Palette; onPress: (id: string) => void }) {
  const look = `${tier}|${selected}|${pinned}|${r.price}|${c.bg}`;
  const [tracking, setTracking] = useState(true);
  const [seen, setSeen] = useState(look);
  if (seen !== look) {
    setSeen(look);
    setTracking(true);
  }
  useEffect(() => {
    if (!tracking) return;
    const t = setTimeout(() => setTracking(false), 400);
    return () => clearTimeout(t);
  }, [tracking]);

  const col = tierColors(c, tier);
  const name = stationName(r.n);
  return (
    <Marker
      coordinate={{ latitude: r.la, longitude: r.lo }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 30 : pinned ? 20 : tier === 'low' ? 12 : 10}
      onPress={() => onPress(r.id)}
      accessibilityLabel={`${name}, ${r.price.toFixed(1)} cents${pinned ? ', pinned' : ''}`}>
      {/* Selection is a thicker blue border, not a scale: Android draws the marker at its layout size, so a scaled tag is clipped */}
      <View style={styles.tagWrap}>
        <View style={[styles.tag, { backgroundColor: c.surface, borderColor: selected ? c.tgp : pinned ? c.fg : c.line, borderWidth: selected ? 3 : pinned ? 2 : 1 }]}>
          <View style={[styles.tagPrice, { backgroundColor: col.bg }]}>
            <Text style={[styles.tagPriceText, { color: col.fg }]}>{r.price.toFixed(1)}</Text>
          </View>
          <View style={styles.tagBrand}>
            {pinned ? <PinIcon filled color={c.fg} size={11} /> : null}
            <Text style={[styles.tagBrandText, { color: c.fg2 }]} numberOfLines={1}>{brandLabel(r.b)}</Text>
          </View>
        </View>
        <View style={[styles.tagPoint, { borderTopColor: selected ? c.tgp : pinned ? c.fg : c.line }]} />
      </View>
    </Marker>
  );
});

function ClusterBubble({ n, c }: { n: number; c: Palette }) {
  const size = n < 10 ? 38 : n < 50 ? 44 : 50;
  return (
    <View style={[styles.cluster, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.tgp }]}>
      <Text style={styles.clusterText}>{n}</Text>
    </View>
  );
}

function FloatChip({ label, onPress, c, strong }: { label: string; onPress: () => void; c: Palette; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.floatChip,
        { backgroundColor: strong ? c.fg : c.surface, borderColor: strong ? c.fg : c.line, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Text style={{ color: strong ? c.bg : c.fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Cheaper ● ● ● Dearer: what the tag colours mean (in the map header) */
export function MapLegend() {
  const c = useTheme();
  return (
    <View
      style={styles.legend}
      accessible
      accessibilityLabel="Price colours: green is the cheapest third on the map, amber the middle, red the dearest third">
      <Text style={[styles.legendText, { color: c.muted }]}>Cheaper</Text>
      {(['low', 'mid', 'high'] as const).map((t) => (
        <View key={t} style={[styles.legendDot, { backgroundColor: tierColors(c, t).bg }]} />
      ))}
      <Text style={[styles.legendText, { color: c.muted }]}>Dearer</Text>
    </View>
  );
}

/** The tapped station: price, the when-to-fill call and its reason, the 7-day forecast, then Directions, Pin and Details */
function StationCard({
  r, pinned, median, tier, onClose,
}: { r: StationRow; pinned: boolean; median: number | undefined; tier: Tier; onClose: () => void }) {
  const c = useTheme();
  usePins();   // re-render when this station is pinned or unpinned from the card
  const [, , code, label, reason, fc7] = r.adv;
  const name = stationName(r.n);
  const gap = median != null ? r.price - median : null;
  const stale = r.age != null && r.age > STALE_DAYS;
  const fcDelta = fc7 != null ? fc7 - r.pump : null;
  const where = tier === 'low' ? 'One of the cheapest here' : tier === 'high' ? 'One of the dearest here' : null;
  const pin = () => {
    if (!togglePin(r.id)) notify(PINS_FULL);
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
      <View style={styles.cardHead}>
        <Pressable
          onPress={() => openStation(r.id)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${r.price.toFixed(1)} cents${r.off ? ` with your ${offText(r.off)} off` : ''}, ${label}`}
          accessibilityHint="Opens the station’s prices and forecast"
          style={{ flex: 1, gap: 3 }}>
          <T style={{ fontWeight: '700', fontSize: 16 }} color={c.fg} numberOfLines={1}>{name}</T>
          <T kind="small" numberOfLines={1}>
            {brandSuburb(name, r.b, r.s)}{r.d != null ? ` · ${r.d.toFixed(1)} km` : ''}{r.m ? ' · Members' : ''}
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
        {where ? <T kind="small" color={tier === 'low' ? c.cheap : c.dear} style={{ fontWeight: '600' }}>{where}</T> : null}
      </View>
      {reason ? <T kind="small" color={c.fg2} numberOfLines={2}>{reason}</T> : null}
      {fcDelta != null ? (
        <T kind="small" color={c.fg2}>
          In 7 days: about <T kind="small" color={c.fg} style={{ fontWeight: '700' }}>{fc7!.toFixed(1)}</T>
          {Math.abs(fcDelta) >= 0.5 ? ` (${fcDelta > 0 ? 'up' : 'down'} ${Math.abs(fcDelta).toFixed(1)}c)` : ' (about the same)'}
          {r.off ? ' at the pump' : ''}
        </T>
      ) : null}
      {stale ? <T kind="small" color={c.up}>{updatedText(r.age)}</T> : null}

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
  tagWrap: { alignItems: 'center' },
  tag: { borderRadius: 8, overflow: 'hidden', minWidth: 62, alignItems: 'stretch' },
  tagPrice: { paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  tagPriceText: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tagBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  tagBrandText: { fontSize: 10, fontWeight: '700', maxWidth: 76 },
  tagPoint: {
    width: 0, height: 0, marginTop: -1,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  cluster: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  clusterText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  meRing: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(42,120,214,0.25)', alignItems: 'center', justifyContent: 'center' },
  meDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#ffffff' },
  topChips: { position: 'absolute', top: Spacing.three, left: 0, right: 0, alignItems: 'center' },
  floatChip: {
    borderWidth: 1, borderRadius: Radius.chip, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  side: { position: 'absolute', top: Spacing.three, right: Spacing.four },
  bottom: { position: 'absolute', left: Spacing.three, right: Spacing.three, alignItems: 'center', gap: Spacing.three },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, fontWeight: '700' },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  card: {
    alignSelf: 'stretch', borderRadius: Radius.card, borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four, gap: Spacing.two,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  cardClose: { paddingLeft: Spacing.one, paddingTop: 2 },
  cardChips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  cardActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  cardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.chip, minHeight: 44 },
});
