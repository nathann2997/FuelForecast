// More → Your car → Discounts: the cents off you get at a brand (a docket, a fuel card, a membership). Lists then
// rank stations by the price you pay. A row per discount, and a sheet to add or change one.
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Chip, Sheet, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_OFF, MAX_DISCOUNTS, MAX_OFF, offText, withDiscount } from '@/lib/discounts';
import { brandOptions } from '@/lib/filters';
import { setSettings, useSettings } from '@/lib/settings';
import type { Station } from '@/lib/types';

const BRANDS_SHOWN = 12;

/** Brands in today's data whatever the fuel, most stations first */
export function allBrands(stations: Station[]): { brand: string; n: number }[] {
  const m = new Map<string, number>();
  for (const s of stations) m.set(s.b, (m.get(s.b) ?? 0) + 1);
  return [...m.entries()].map(([brand, n]) => ({ brand, n })).sort((a, b) => b.n - a.n || a.brand.localeCompare(b.brand));
}

export function DiscountsEditor({ stations }: { stations: Station[] | undefined }) {
  const c = useTheme();
  const { discounts } = useSettings();
  const [edit, setEdit] = useState<{ brand: string | null; cents: number } | null>(null);
  const list = useMemo(() => Object.entries(discounts).sort((a, b) => a[0].localeCompare(b[0])), [discounts]);
  const taken = useMemo(() => list.map(([b]) => b), [list]);
  const brands = useMemo(() => (stations ? allBrands(stations) : []), [stations]);
  const full = list.length >= MAX_DISCOUNTS;

  return (
    <View style={{ gap: Spacing.two }}>
      {list.length ? (
        <View style={[styles.list, { borderColor: c.line }]}>
          {list.map(([brand, cents], i) => (
            <View key={brand} style={[styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Pressable
                onPress={() => setEdit({ brand, cents })}
                accessibilityRole="button"
                accessibilityLabel={`${brand}, ${offText(cents)} off a litre. Change`}
                style={styles.rowMain}>
                <T color={c.fg} style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{brand}</T>
                <T kind="num" color={c.cheap}>−{offText(cents)}</T>
              </Pressable>
              <Pressable
                onPress={() => setSettings({ discounts: withDiscount(discounts, brand, null) })}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${brand} discount`}
                hitSlop={8}
                style={styles.remove}>
                <T color={c.muted} style={{ fontSize: 16 }}>✕</T>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <T kind="small">Got a docket, fuel card or membership? Add it and stations rank by what you pay.</T>
      )}
      {!full && stations ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <Chip label="+ Add a discount" onPress={() => setEdit({ brand: null, cents: DEFAULT_OFF })} />
        </View>
      ) : null}
      {stations && edit ? (
        <DiscountSheet
          key={edit.brand ?? '+'}
          start={edit}
          brands={brands}
          taken={taken}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </View>
  );
}

function DiscountSheet({
  start, brands, taken, onClose,
}: { start: { brand: string | null; cents: number }; brands: { brand: string; n: number }[]; taken: string[]; onClose: () => void }) {
  const c = useTheme();
  const { discounts } = useSettings();
  const [brand, setBrand] = useState<string | null>(start.brand);
  const [cents, setCents] = useState(start.cents);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const editing = start.brand != null;
  // Brands you already have a discount at are left out (tap their row to change them), except the one being edited:
  // renaming onto another discount's brand would silently overwrite it
  const pool = useMemo(() => brands.filter((b) => b.brand === start.brand || !taken.includes(b.brand)), [brands, taken, start.brand]);
  const shown = useMemo(() => brandOptions(pool, brand ? [brand] : [], q, all, BRANDS_SHOWN), [pool, brand, q, all]);
  // Whole cents from the stepper (a saved 4.5c steps to 3.5 / 5.5)
  const step = (d: number) => setCents((v) => Math.min(MAX_OFF, Math.max(1, v + d)));
  const save = () => {
    if (!brand) return;
    let next = discounts;
    if (editing && start.brand !== brand) next = withDiscount(next, start.brand!, null);
    setSettings({ discounts: withDiscount(next, brand, cents) });
    onClose();
  };

  return (
    <Sheet
      title={editing ? 'Change discount' : 'Add a discount'}
      visible
      onClose={onClose}
      scroll
      footer={<Button label={brand ? `Save ${offText(cents)} off at ${brand}` : 'Choose a brand'} onPress={save} disabled={!brand} />}>
      <View style={{ gap: Spacing.two }}>
        <T kind="eyebrow">Cents off a litre</T>
        <View style={styles.stepper}>
          <StepButton label="−" a11y="1 cent less" onPress={() => step(-1)} disabled={cents <= 1} />
          <T kind="hero" style={{ minWidth: 72, textAlign: 'center' }} accessibilityLiveRegion="polite">{offText(cents)}</T>
          <StepButton label="+" a11y="1 cent more" onPress={() => step(1)} disabled={cents >= MAX_OFF} />
        </View>
      </View>

      <View style={{ gap: Spacing.two }}>
        <T kind="eyebrow">At which brand</T>
        {pool.length > BRANDS_SHOWN ? (
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
          {shown.map((b) => (
            <Chip key={b.brand} label={b.brand} on={brand === b.brand} onPress={() => setBrand(b.brand)} />
          ))}
          {!shown.length ? <T kind="small">No brand matches “{q.trim()}”.</T> : null}
        </View>
        {!q.trim() && pool.length > BRANDS_SHOWN ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <Chip label={all ? 'Fewer brands' : `All ${pool.length} brands`} onPress={() => setAll(!all)} />
          </View>
        ) : null}
        <T kind="small">Check which brands take your docket or card. Bowser takes the discount off every station of that brand.</T>
      </View>
    </Sheet>
  );
}

function StepButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.step, { borderColor: c.line, backgroundColor: c.surface, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <T color={c.fg} style={{ fontSize: 24, fontWeight: '700' }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.input, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48, paddingLeft: Spacing.three },
  remove: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  step: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: Radius.input, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
