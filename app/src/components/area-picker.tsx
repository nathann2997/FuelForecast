import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { findSuburb, type Place } from '@/lib/geo';
import { locate } from '@/lib/location';
import { setSettings } from '@/lib/settings';
import type { Suburb } from '@/lib/types';

/** Set the remembered area: one tap for GPS, or a suburb / postcode search with suggestions */
export function AreaPicker({ suburbs, onDone }: { suburbs: Suburb[]; onDone?: () => void }) {
  const c = useTheme();
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return suburbs.filter((x) => x.s.toLowerCase().startsWith(q) || String(x.pc).startsWith(q)).slice(0, 6);
  }, [suburbs, query]);

  const pick = (p: Place) => {
    setSettings({ home: p });
    track('area.set', { source: p.gps ? 'gps' : 'suburb' });
    setQuery('');
    setMsg(null);
    onDone?.();
  };
  const submit = () => {
    const p = findSuburb(suburbs, query);
    if (p) pick(p);
    else if (query.trim()) setMsg(`No Sydney suburb matches “${query.trim()}”. Try a postcode.`);
  };
  async function gps() {
    setBusy(true);
    setMsg(null);
    try {
      pick(await locate());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      const m = e instanceof Error ? e.message : '';
      track('area.locate_failed', { reason: /permission/i.test(m) ? 'denied' : /timed out/i.test(m) ? 'timeout' : 'other' }, 'warn');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: Spacing.three }}>
      <Button label="◎  Use my location" onPress={gps} busy={busy} />
      <TextInput
        value={query}
        onChangeText={(t) => { setQuery(t); setMsg(null); }}
        onSubmitEditing={submit}
        placeholder="Or type a suburb or postcode"
        placeholderTextColor={c.muted}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Suburb or postcode"
        style={[styles.input, { color: c.fg, borderColor: c.line, backgroundColor: c.surface }]}
      />
      {suggestions.length ? (
        <View style={[styles.list, { borderColor: c.line, backgroundColor: c.surface }]}>
          {suggestions.map((x, i) => (
            <Pressable
              key={`${x.s}|${x.pc}`}
              onPress={() => pick({ label: `${x.s} ${x.pc}`, la: x.la, lo: x.lo })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sug, i > 0 && { borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: c.sunk }]}>
              <T color={c.fg} style={{ flex: 1 }}>{x.s}</T>
              <T kind="small">{x.pc} · {x.n} station{x.n === 1 ? '' : 's'}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {msg ? <T kind="small" color={c.up}>{msg}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: Radius.input, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.input, overflow: 'hidden' },
  sug: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: Spacing.two },
});
