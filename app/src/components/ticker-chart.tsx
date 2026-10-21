// The station page's "ticker" chart: the station's daily price with the Sydney median as a faint dashed line,
// the 14-day forecast as a dotted continuation inside its likely range, a "today" divider, and drag-to-scrub.
// Plain react-native-svg like price-chart.tsx, so it renders the same on Android, iOS and the web preview.
import { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel } from '@/lib/outlook';
import { tickerBounds, type TickerData } from '@/lib/station';
import type { Series } from '@/lib/types';

// System sans for SVG labels; SVG text otherwise falls back to a serif on some renderers
const FONT = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' });
const H = 220, PAD = { l: 4, r: 40, t: 20, b: 22 };

function linePath(s: Series, x: (i: number) => number, y: (v: number) => number) {
  let d = '', pen = false;
  s.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function bandPath(lo: Series, hi: Series, x: (i: number) => number, y: (v: number) => number) {
  const idx = lo.map((v, i) => (v != null && hi[i] != null ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return '';
  return 'M' + idx.map((i) => `${x(i).toFixed(1)},${y(hi[i]!).toFixed(1)}`).join('L') +
    'L' + [...idx].reverse().map((i) => `${x(i).toFixed(1)},${y(lo[i]!).toFixed(1)}`).join('L') + 'Z';
}

/** Area under the history line, down to the chart floor (only the last unbroken run, so gaps don't smear) */
function areaPath(s: Series, x: (i: number) => number, y: (v: number) => number, floor: number) {
  let a = -1, b = -1;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] != null) { if (b < 0) b = i; a = i; } else if (b >= 0) break;
  }
  if (a < 0 || b - a < 1) return '';
  let d = `M${x(a).toFixed(1)},${floor}`;
  for (let i = a; i <= b; i++) d += `L${x(i).toFixed(1)},${y(s[i]!).toFixed(1)}`;
  return d + `L${x(b).toFixed(1)},${floor}Z`;
}

const c1 = (v: number | null | undefined) => (v == null ? '–' : `${v.toFixed(1)}c`);

export function TickerChart({
  t, color, summary, onScrubbing,
}: {
  t: TickerData;
  color: string;                    // line colour (cheap when the range is down, dear when up)
  summary: string;                  // accessibility summary
  onScrubbing?: (active: boolean) => void;   // lets the screen lock its scroll while the finger is on the chart
}) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const N = t.dates.length;
  const { min, max, ticks } = useMemo(() => tickerBounds(t), [t]);
  const x = (i: number) => PAD.l + (i / Math.max(1, N - 1)) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const floor = H - PAD.b;

  const paths = useMemo(() => {
    if (!w) return null;
    return {
      px: linePath(t.px, x, y), med: linePath(t.med, x, y), fc: linePath(t.fc, x, y),
      band: bandPath(t.lo, t.hi, x, y), area: areaPath(t.px, x, y, floor),
    };
    // x and y derive from t and w
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, w]);

  const pick = (e: GestureResponderEvent) => {
    const i = Math.round(((e.nativeEvent.locationX - PAD.l) / Math.max(1, w - PAD.l - PAD.r)) * (N - 1));
    setSel(Math.max(0, Math.min(N - 1, i)));
  };
  const end = () => {
    setSel(null);
    onScrubbing?.(false);
  };

  const i = sel ?? (t.today >= 0 ? t.today : N - 1);
  const isFc = i > t.today;
  // On today, a fuel with no history still has today's price as the forecast's first point
  const v = isFc ? t.fc[i] : (t.px[i] ?? (i === t.today ? t.fc[i] : null));
  const m = t.med[i];
  const today = t.today >= 0 ? t.today : null;
  const lastFc = N - 1;

  let line2 = '';
  if (isFc) line2 = `Likely ${c1(t.lo[i])} to ${c1(t.hi[i])}`;
  else if (v != null && m != null) {
    const g = v - m;
    line2 = `Sydney median ${c1(m)} · ${Math.abs(g) < 0.05 ? 'at the median' : `${Math.abs(g).toFixed(1)}c ${g < 0 ? 'cheaper' : 'dearer'}`}`;
  } else if (m != null) line2 = `Sydney median ${c1(m)}`;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ minHeight: 40 }} accessibilityLiveRegion={sel != null ? 'polite' : 'none'}>
        <T kind="small" color={c.fg} style={{ fontWeight: '700' }}>
          {N ? `${dayLabel(t.dates[i])}${isFc ? ' · forecast' : i === t.today ? ' · today' : ''} · ${v == null ? 'no price' : `${isFc ? 'about ' : ''}${c1(v)}`}` : ''}
        </T>
        <T kind="small">{line2 || ' '}</T>
      </View>
      <View style={{ height: H }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && paths ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id="tickerArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((tv) => (
              <Line key={`g${tv}`} x1={PAD.l} x2={w - PAD.r} y1={y(tv)} y2={y(tv)} stroke={c.line} strokeWidth={1} />
            ))}
            {ticks.map((tv) => (
              <SvgText key={`l${tv}`} x={w - PAD.r + 6} y={y(tv) + 4} fill={c.muted} fontSize={11} fontFamily={FONT}>{`${tv}`}</SvgText>
            ))}
            {paths.area ? <Path d={paths.area} fill="url(#tickerArea)" /> : null}
            {paths.band ? <Path d={paths.band} fill={color} opacity={0.13} /> : null}
            <Path d={paths.med} stroke={c.muted} strokeWidth={1.5} strokeDasharray="4,4" opacity={0.75} fill="none" />
            <Path d={paths.px} stroke={color} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Path d={paths.fc} stroke={color} strokeWidth={2.5} strokeDasharray="0.1,5" strokeLinecap="round" fill="none" />
            {today != null ? (
              <>
                <Line x1={x(today)} x2={x(today)} y1={PAD.t - 4} y2={floor} stroke={c.muted} strokeWidth={1} strokeDasharray="2,3" />
                {lastFc > today ? (
                  <SvgText x={x(today) + 4} y={PAD.t - 8} fill={c.muted} fontSize={11} fontWeight="700" fontFamily={FONT}>Forecast →</SvgText>
                ) : null}
                {t.fc[today] != null || t.px[today] != null ? (
                  <Circle cx={x(today)} cy={y((t.px[today] ?? t.fc[today])!)} r={4.5} fill={color} stroke={c.bg} strokeWidth={2} />
                ) : null}
              </>
            ) : null}
            {t.fc[lastFc] != null && lastFc !== today ? <Circle cx={x(lastFc)} cy={y(t.fc[lastFc]!)} r={3} fill={color} /> : null}
            {sel != null ? (
              <>
                <Line x1={x(sel)} x2={x(sel)} y1={PAD.t - 4} y2={floor} stroke={c.fg2} strokeWidth={1} />
                {v != null ? <Circle cx={x(sel)} cy={y(v)} r={5} fill={c.bg} stroke={color} strokeWidth={2.5} /> : null}
              </>
            ) : null}
            {N > 0 ? (
              <SvgText x={x(0)} y={H - 6} fill={c.muted} fontSize={11} fontFamily={FONT} textAnchor="start">
                {today === 0 ? 'Today' : dayLabel(t.dates[0]).slice(4)}
              </SvgText>
            ) : null}
            {today != null && today > 0 && today < lastFc && x(today) - x(0) > 56 && x(lastFc) - x(today) > 56 ? (
              <SvgText x={x(today)} y={H - 6} fill={c.muted} fontSize={11} fontWeight="700" fontFamily={FONT} textAnchor="middle">Today</SvgText>
            ) : null}
            {N > 1 ? (
              <SvgText x={x(lastFc)} y={H - 6} fill={c.muted} fontSize={11} fontFamily={FONT} textAnchor="end">
                {lastFc === today ? 'Today' : dayLabel(t.dates[lastFc]).slice(4)}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}
        {/* Touch layer on top of the SVG so locationX is always relative to the chart, not to an SVG child */}
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={summary}
          // Claim the touch only once the drag is clearly sideways, so a vertical swipe that starts on the chart
          // still scrolls the page. Once scrubbing, the page's scroll is locked and the touch isn't given up.
          onTouchStart={(e) => { start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }; }}
          onMoveShouldSetResponder={(e) => {
            const dx = Math.abs(e.nativeEvent.pageX - start.current.x), dy = Math.abs(e.nativeEvent.pageY - start.current.y);
            return dx > 6 && dx > dy;
          }}
          onResponderGrant={(e) => { onScrubbing?.(true); pick(e); }}
          onResponderMove={pick}
          onResponderRelease={end}
          onResponderTerminate={end}
          onResponderTerminationRequest={() => false}
        />
      </View>
      <View style={styles.keys}>
        {t.px.some((p) => p != null) ? (
          <>
            <Key color={color} text="This station" />
            <Key color={c.muted} text="Sydney median" dashed />
          </>
        ) : null}
        {today != null && lastFc > today ? <Key color={color} text="Forecast and likely range" block /> : null}
      </View>
    </View>
  );
}

function Key({ color, text, dashed, block }: { color: string; text: string; dashed?: boolean; block?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dashed ? (
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0, 1, 2].map((k) => <View key={k} style={{ width: 4, height: 2, backgroundColor: color }} />)}
        </View>
      ) : (
        <View style={{ width: 16, height: block ? 10 : 3, borderRadius: 2, backgroundColor: color, opacity: block ? 0.25 : 1 }} />
      )}
      <T kind="small">{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  keys: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
});
