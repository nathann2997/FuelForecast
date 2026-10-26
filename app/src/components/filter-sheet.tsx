// The Filters sheet on the Stations tab: sort, radius, brands, when to fill, max price, members, older prices, pinned only.
import { useMemo, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { Button, Chip, Segmented, Sheet, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ADVICE_GROUPS, brandOptions, RADII, STALE_DAYS } from '@/lib/filters';
import { resetFilters, setSettings, useSettings } from '@/lib/settings';

const BRANDS_SHOWN = 12;
const SORTS = [['price', 'Cheapest'], ['distance', 'Nearest']] as const;

export function FilterSheet({
  visible, onClose, brands, staleCount, resultCount, hasHome,
}: {
  visible: boolean;
  onClose: () => void;
  brands: { brand: string; n: number }[];   // most common first
  staleCount: number;                        // stations hidden for old prices
  resultCount: number | null;                // stations the list shows with the current filters; null on the map (it shows what's in view)
  hasHome: boolean;                          // sort by distance and radius need an area
}) {
  const c = useTheme();
  const s = useSettings();
  const [q, setQ] = useState('');
  const [allBrands, setAllBrands] = useState(false);
  // Max price is typed; keep the text while editing so "21" on the way to "215" doesn't fight the input
  const [maxText, setMaxText] = useState<string | null>(null);
  const maxShown = maxText ?? (s.maxPrice != null ? String(s.maxPrice) : '');

  const shownBrands = useMemo(() => brandOptions(brands, s.brands, q, allBrands, BRANDS_SHOWN), [brands, q, allBrands, s.brands]);

  const toggle = <K extends string>(list: K[], k: K) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const onMax = (t: string) => {
    const clean = t.replace(/[^0-9.]/g, '');
    setMaxText(clean);
    const v = parseFloat(clean);
    setSettings({ maxPrice: Number.isFinite(v) && v > 0 ? v : null });
  };
  const reset = () => {
    resetFilters();
    setMaxText(null);
    setQ('');
  };

  return (
    <Sheet
      title="Filters"
      visible={visible}
      onClose={onClose}
      scroll
      footer={
        <View style={[styles.footer, { borderTopColor: c.line }]}>
          <View style={{ flex: 1 }}>
            <Button label="Reset" kind="secondary" onPress={reset} />
          </View>
          <View style={{ flex: 2 }}>
            <Button label={resultCount == null ? 'Show on map' : resultCount === 0 ? 'No stations match' : `Show ${resultCount} station${resultCount === 1 ? '' : 's'}`} onPress={onClose} />
          </View>
        </View>
      }>
      <Group label="Sort">
        <Segmented options={SORTS} value={hasHome ? s.sort : 'price'} onChange={(k) => setSettings({ sort: k })} />
        {!hasHome ? <T kind="small">Set your area to sort by distance and choose a radius.</T> : null}
      </Group>

      {hasHome ? (
        <Group label="Radius">
          <View style={styles.wrap}>
            {RADII.map((k) => (
              <Chip key={k} label={`${k} km`} on={s.radiusKm === k} onPress={() => setSettings({ radiusKm: k })} />
            ))}
          </View>
        </Group>
      ) : null}

      <Group label="When to fill">
        <View style={styles.wrap}>
          {ADVICE_GROUPS.map(([k, label]) => (
            <Chip key={k} label={label} on={s.advice.includes(k)} onPress={() => setSettings({ advice: toggle(s.advice, k) })} />
          ))}
        </View>
      </Group>

      <Group label={s.brands.length ? `Brands (${s.brands.length} selected)` : 'Brands'}>
        {brands.length > BRANDS_SHOWN ? (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search brands"
            placeholderTextColor={c.muted}
            autoCorrect={false}
            accessibilityLabel="Search brands"
            style={[styles.input, { color: c.fg, borderColor: c.line, backgroundColor: c.surface }]}
          />
        ) : null}
        <View style={styles.wrap}>
          {shownBrands.map((b) => (
            <Chip key={b.brand} label={b.brand} on={s.brands.includes(b.brand)} onPress={() => setSettings({ brands: toggle(s.brands, b.brand) })} />
          ))}
          {!shownBrands.length ? <T kind="small">No brand matches “{q.trim()}”.</T> : null}
        </View>
        {!q.trim() && brands.length > BRANDS_SHOWN ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Chip label={allBrands ? 'Fewer brands' : `All ${brands.length} brands`} onPress={() => setAllBrands(!allBrands)} />
          </View>
        ) : null}
      </Group>

      <Group label="Max price">
        <View style={styles.between}>
          <TextInput
            value={maxShown}
            onChangeText={onMax}
            onBlur={() => setMaxText(null)}
            placeholder="Any"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            accessibilityLabel="Maximum price in cents per litre"
            style={[styles.input, { flex: 1, color: c.fg, borderColor: c.line, backgroundColor: c.surface }]}
          />
          <T color={c.fg2}>c/L</T>
          {s.maxPrice != null ? <Chip label="Clear" onPress={() => { setMaxText(null); setSettings({ maxPrice: null }); }} /> : null}
        </View>
      </Group>

      <View style={{ gap: Spacing.one }}>
        <Toggle label="Members-only sites (Costco)" value={s.members} onChange={(v) => setSettings({ members: v })} />
        <Toggle
          label={`Prices older than ${STALE_DAYS} days${staleCount ? ` (${staleCount})` : ''}`}
          value={s.showStale}
          onChange={(v) => setSettings({ showStale: v })}
        />
        <Toggle label="Pinned stations only" value={s.pinnedOnly} onChange={(v) => setSettings({ pinnedOnly: v })} />
      </View>

    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: Spacing.two }}>
      <T kind="eyebrow">{label}</T>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useTheme();
  return (
    <View style={[styles.between, { minHeight: 44 }]}>
      <T color={c.fg} style={{ flex: 1 }}>{label}</T>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  between: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  input: { borderWidth: 1, borderRadius: Radius.input, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  footer: { flexDirection: 'row', gap: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
