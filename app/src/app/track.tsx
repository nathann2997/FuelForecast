// "Was Bowser right?": how often the daily call was right, from live calls once enough have played out (until then the
// same rule replayed on past prices), and each recent call with what happened the week after. Opened from Today's
// proof strip and More. Data: track.json (sydney/pipeline/track_api.py).
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, Disclosure, Loading, Screen, Section, T } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useReady } from '@/lib/analytics';
import { isNotFound, useTrack } from '@/lib/api';
import { fuelName, nice } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { callsFor, callValue, callWord, headline, LIVE_MIN, MARK, outcomeText, STATUS_WORD } from '@/lib/track';
import type { Call, CallStatus, Tally } from '@/lib/types';

export default function TrackRecord() {
  const c = useTheme();
  const s = useSettings();
  const q = useTrack();
  useReady(!q.isPending);
  const t = q.data;
  const h = t ? headline(t, s.fuel) : null;
  const tal: Tally | undefined = t ? (h?.live ? t.live[s.fuel] : t.replay?.[s.fuel]) : undefined;
  const calls = t ? callsFor(t, s.fuel) : [];
  const since = t?.live[s.fuel]?.since;

  return (
    <Screen
      title="Track record"
      subtitle={`Sydney ${fuelName(s.fuel)}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onRefresh={() => q.refetch()}
      refreshing={q.isRefetching}>
      {!t ? (
        isNotFound(q.error) ? (
          <Card><T>The track record arrives with the next price update.</T></Card>
        ) : (
          <Loading error={q.error} onRetry={() => q.refetch()} />
        )
      ) : (
        <>
          {h && tal ? (
            <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.line }]}>
              <T kind="eyebrow">Was Bowser right?</T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two }}>
                <T kind="hero" color={c.cheap} style={{ fontSize: 44, lineHeight: 50, letterSpacing: -1.2 }}>{h.pct}%</T>
                <T color={c.fg} style={{ fontWeight: '700' }}>of calls right</T>
              </View>
              <T kind="small" color={c.fg2}>{h.live ? h.sub : `Over ${tal.n.toLocaleString('en-AU')} days ${h.sub}`}</T>
              <Bar t={tal} />
              {!h.live ? (
                <T kind="small">
                  {since
                    ? `Bowser has kept its daily calls since ${nice(since, false)}. Live results take over once ${LIVE_MIN} have played out.`
                    : `Live results take over once ${LIVE_MIN} daily calls have played out.`}
                </T>
              ) : null}
            </View>
          ) : null}

          <Section title="Recent calls">
            {calls.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {calls.map((x, i) => (
                  <CallRow key={`${x.date}|${x.fuel}`} c={x} window={t.window} tankL={s.tankL} last={i === calls.length - 1} />
                ))}
              </Card>
            ) : (
              <Card><T>Each morning’s call shows here, and is scored once the week after has played out.</T></Card>
            )}
          </Section>

          <Disclosure title="How calls are scored">
            <T kind="small" color={c.fg2}>
              Each day’s first call is kept as it was made, with the Sydney median it was made at. Once the week after is over, it’s checked against the average Sydney median over those {t.window} days.
            </T>
            <T kind="small" color={c.fg2}>
              Fill: right if prices averaged 1c or more higher, wrong if 1c or more lower. Wait: the reverse. No rush: right if they moved less than 3c, wrong if 5c or more. Anything in between is a close call.
            </T>
            <T kind="small" color={c.fg2}>
              The tested figure applies the same rule to the forecast model’s walk-forward test from 2021: each day predicted only from data before it.
            </T>
          </Disclosure>
        </>
      )}
    </Screen>
  );
}

const PILL: Record<CallStatus, string> = { right: 'Right', close: 'Close', wrong: 'Wrong', pending: 'Pending' };

function statusColor(c: ReturnType<typeof useTheme>, s: CallStatus) {
  return s === 'right' ? c.cheap : s === 'wrong' ? c.dear : s === 'close' ? c.fg2 : c.muted;
}

/** Right / close / wrong as one stacked bar with counts */
function Bar({ t }: { t: Tally }) {
  const c = useTheme();
  const parts = (['right', 'close', 'wrong'] as const).filter((k) => t[k] > 0);
  return (
    <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
      <View style={[styles.bar, { backgroundColor: c.sunk }]} accessible accessibilityLabel={`${t.right} right, ${t.close} close, ${t.wrong} wrong`}>
        {parts.map((k) => (
          <View key={k} style={{ flex: t[k], backgroundColor: k === 'close' ? c.calmStrong : statusColor(c, k) }} />
        ))}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        {(['right', 'close', 'wrong'] as const).map((k) => (
          <T key={k} kind="small" color={c.fg2}>
            <T kind="small" color={k === 'close' ? c.calmStrong : statusColor(c, k)} style={{ fontWeight: '800' }}>{MARK[k]} </T>
            {t[k].toLocaleString('en-AU')} {k === 'close' ? 'close' : k}
          </T>
        ))}
      </View>
    </View>
  );
}

function CallRow({ c: x, window, tankL, last }: { c: Call; window: number; tankL: number; last: boolean }) {
  const c = useTheme();
  const v = callValue(x, tankL);
  const col = statusColor(c, x.status);
  return (
    <View
      style={[styles.row, !last && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessible
      accessibilityLabel={`${nice(x.date)}: ${x.head} at ${x.now.toFixed(1)} cents. ${outcomeText(x, window)}.${x.move == null ? '' : ` ${STATUS_WORD[x.status]}.`}${v ? ` ${v.text}.` : ''}`}>
      <View style={[styles.mark, { borderColor: col, backgroundColor: x.status === 'pending' ? 'transparent' : col }]}>
        <T style={{ fontWeight: '800', fontSize: 14, lineHeight: 18 }} color={x.status === 'pending' ? col : c.bg}>{MARK[x.status]}</T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T color={c.fg} style={{ fontWeight: '700' }} numberOfLines={1}>
          {nice(x.date, false)} · {callWord(x)}
          <T kind="small" style={{ fontWeight: '400' }}>{`  at ${x.now.toFixed(1)}`}</T>
        </T>
        <T kind="small" color={c.fg2}>{outcomeText(x, window)}</T>
        {v ? <T kind="small" color={v.good ? c.cheap : c.dear} style={{ fontWeight: '600' }}>{v.text}</T> : null}
      </View>
      <T kind="small" color={col} style={{ fontWeight: '700' }}>{PILL[x.status]}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: Spacing.five, gap: Spacing.two },
  bar: { flexDirection: 'row', height: 10, borderRadius: Radius.chip, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four, rowGap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
  mark: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
