// "Filled up" on the station page: log a fill with the price you paid and the litres, both prefilled and editable.
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Sheet, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addFill } from '@/lib/fills';
import { fuelName, stationName, sydneyToday } from '@/lib/format';
import { loggedText, money } from '@/lib/savings';
import type { Fuel } from '@/lib/types';

export type FillTarget = { id: string; n: string; b: string; s: string };

/** A typed number to 0.1, or null while the text isn't one in range */
const parse = (t: string, lo: number, hi: number) => {
  const v = Math.round(parseFloat(t.replace(',', '.')) * 10) / 10;
  return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
};

export function FillSheet({
  station, fuel, price, pump, median, tankL, onClose, onSaved,
}: {
  station: FillTarget; fuel: Fuel;
  price: number;              // your price today (pump less your discount)
  pump: number;               // the pump price today
  median: number | null;      // today's Sydney median for the fuel
  tankL: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const c = useTheme();
  const [paidT, setPaidT] = useState(price.toFixed(1));
  const [litresT, setLitresT] = useState(String(tankL));
  const paid = parse(paidT, 50, 800);
  const litres = parse(litresT, 1, 200);
  const ok = paid != null && litres != null;
  const gap = ok && median != null ? median - paid : null;

  const saved = useRef(false);   // a quick double tap logs one fill, not two
  const save = () => {
    if (!ok || saved.current) return;
    saved.current = true;
    const f = addFill({
      date: sydneyToday(), stationId: station.id || null, name: stationName(station.n), brand: station.b, suburb: station.s,
      fuel, pump, paid, litres, median,
    });
    onSaved(f ? loggedText(f) : 'Couldn’t log that fill.');
    onClose();
  };

  return (
    <Sheet
      title="Filled up"
      visible
      onClose={onClose}
      footer={<Button label={ok ? `Log ${litres} L at ${paid!.toFixed(1)}c` : 'Check the price and litres'} onPress={save} disabled={!ok} />}>
      <T color={c.fg2}>{stationName(station.n)} · {fuelName(fuel)} · today</T>
      <View style={styles.fields}>
        <Field label="You paid (c/L)" value={paidT} onChange={setPaidT} bad={paid == null} a11y="Price you paid in cents per litre" />
        <Field label="Litres" value={litresT} onChange={setLitresT} bad={litres == null} a11y="Litres" />
      </View>
      {gap != null ? (
        <T kind="small" color={gap > 0.05 ? c.cheap : gap < -0.05 ? c.dear : c.fg2} style={{ fontWeight: '600' }}>
          {Math.abs(gap) < 0.05
            ? 'Right on the Sydney median today.'
            : `${Math.abs(gap).toFixed(1)}c ${gap > 0 ? 'under' : 'over'} the Sydney median (${median!.toFixed(1)}), ${money(Math.abs((gap * litres!) / 100))} on this fill.`}
        </T>
      ) : null}
      <T kind="small">A week from now, Bowser also shows whether you filled at a good time. Your fills stay on this phone.</T>
    </Sheet>
  );
}

function Field({ label, value, onChange, bad, a11y }: { label: string; value: string; onChange: (t: string) => void; bad: boolean; a11y: string }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1, gap: Spacing.two }}>
      <T kind="eyebrow">{label}</T>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={a11y}
        style={[styles.input, { color: c.fg, borderColor: bad ? c.up : c.line, backgroundColor: c.surface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', gap: Spacing.three },
  input: { borderWidth: 1, borderRadius: Radius.input, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
