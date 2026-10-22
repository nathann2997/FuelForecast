// Under Today's verdict: the evidence that Bowser is worth it, as tappable tiles. How often its calls were right opens
// /track; your savings (once you've logged a fill) open /savings.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHistory, useTrack } from '@/lib/api';
import { useFills } from '@/lib/fills';
import { useSettings } from '@/lib/settings';
import { headline } from '@/lib/track';
import { money, roundCents, summarise } from '@/lib/savings';

export function ProofStrip() {
  const fills = useFills();
  const hq = useHistory();
  const tq = useTrack();
  const { fuel } = useSettings();
  const sum = useMemo(() => (fills.length ? summarise(fills, hq.data) : null), [fills, hq.data]);
  const h = tq.data ? headline(tq.data, fuel) : null;
  if (!sum && !h) return null;
  const saved = sum ? roundCents(sum.total) : 0;
  return (
    <View style={styles.strip}>
      {h ? (
        <Tile
          eyebrow="Calls right"
          big={`${h.pct}%`}
          tone="flat"
          sub={h.short}
          a11y={`Bowser's calls: right ${h.pct}% of the time, ${h.sub}. Opens the track record`}
          onPress={() => router.push('/track')}
        />
      ) : null}
      {sum ? (
      <Tile
        eyebrow={saved > 0 ? 'You saved' : 'Your fills'}
        big={money(sum.total)}
        tone={saved > 0 ? 'cheap' : saved < 0 ? 'dear' : 'flat'}
        sub={`${sum.n} fill${sum.n === 1 ? '' : 's'}`}
        a11y={`${saved > 0 ? 'You saved' : 'Your fills, against the Sydney average'}: ${money(sum.total)} over ${sum.n} fill${sum.n === 1 ? '' : 's'}. Opens your savings`}
        onPress={() => router.push('/savings')}
      />
      ) : null}
    </View>
  );
}

export function Tile({
  eyebrow, big, sub, tone, a11y, onPress,
}: { eyebrow: string; big: string; sub: string; tone: 'cheap' | 'dear' | 'flat'; a11y: string; onPress: () => void }) {
  const c = useTheme();
  const color = tone === 'cheap' ? c.cheap : tone === 'dear' ? c.dear : c.fg;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.tile, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.75 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T kind="eyebrow" numberOfLines={1}>{eyebrow}</T>
        <T kind="bignum" color={color} numberOfLines={1}>{big}</T>
        <T kind="small" numberOfLines={1}>{sub}</T>
      </View>
      <T color={c.muted} style={{ fontSize: 22 }}>›</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: Spacing.three },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.card, padding: Spacing.four },
});
