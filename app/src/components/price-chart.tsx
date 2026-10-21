import { useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { T } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { yBounds, type ChartData } from '@/lib/chart';
import { nice } from '@/lib/format';
import type { Series } from '@/lib/types';

const H = 260, PAD = { l: 40, r: 8, t: 8, b: 22 };

/** Line path through non-null points; gaps break the line */
function linePath(s: Series, x: (i: number) => number, y: (v: number) => number) {
  let d = '', pen = false;
  s.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Filled band between two series, one polygon per unbroken run */
function bandPath(lo: Series, hi: Series, x: (i: number) => number, y: (v: number) => number) {
  let d = '', run: number[] = [];
  const flush = () => {
    if (run.length > 1) {
      d += 'M' + run.map((i) => `${x(i).toFixed(1)},${y(hi[i]!).toFixed(1)}`).join('L');
      d += 'L' + [...run].reverse().map((i) => `${x(i).toFixed(1)},${y(lo[i]!).toFixed(1)}`).join('L') + 'Z';
    }
    run = [];
  };
  lo.forEach((v, i) => (v != null && hi[i] != null ? run.push(i) : flush()));
  flush();
  return d;
}

export function PriceChart({ d, label }: { d: ChartData; label: string }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const { min, max } = yBounds(d);
  const N = d.dates.length;
  const x = (i: number) => PAD.l + (i / Math.max(1, N - 1)) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const step = (max - min) / 10 > 6 ? 20 : 10;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  const xTicks = [0, Math.floor((N - 1) / 2), N - 1];

  // Paths depend only on the data and width, not on the scrub position: build them once per layout
  const paths = useMemo(() => {
    if (!w) return null;
    return {
      band: bandPath(d.p10, d.p90, x, y), fan: bandPath(d.lo, d.hi, x, y),
      tgp: linePath(d.tgp, x, y), med: linePath(d.med, x, y), fc: linePath(d.fc, x, y),
    };
    // x and y are derived from d and w
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, w]);

  const pick = (e: GestureResponderEvent) => {
    const i = Math.round(((e.nativeEvent.locationX - PAD.l) / (w - PAD.l - PAD.r)) * (N - 1));
    setSel(Math.max(0, Math.min(N - 1, i)));
  };
  const i = sel ?? d.asofIndex;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ minHeight: 40 }}>
        <T kind="small" color={c.fg}>{nice(d.dates[i])}{i > d.asofIndex ? ' (forecast)' : ''}</T>
        <T kind="small">
          {tooltip(d, i, label)}
        </T>
      </View>
      <View
        style={{ height: H }}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => false}
        accessibilityRole="image"
        accessibilityLabel={`Chart of Sydney ${label} median pump price, wholesale price and 14-day forecast`}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <G>
              {ticks.map((v) => (
                <G key={v}>
                  <Line x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} stroke={c.line} strokeWidth={1} />
                  <SvgText x={PAD.l - 6} y={y(v) + 4} fill={c.muted} fontSize={10} fontFamily={Fonts.mono} textAnchor="end">{`${v}c`}</SvgText>
                </G>
              ))}
              {xTicks.map((k, j) => (
                <SvgText key={k} x={x(k)} y={H - 6} fill={c.muted} fontSize={10} fontFamily={Fonts.mono}
                  textAnchor={j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}>{nice(d.dates[k])}</SvgText>
              ))}
            </G>
            {paths ? (
              <G>
                <Path d={paths.band} fill={c.band} />
                <Path d={paths.fan} fill={c.fan} />
                <Path d={paths.tgp} stroke={c.tgp} strokeWidth={1.5} fill="none" />
                <Path d={paths.med} stroke={c.retail} strokeWidth={1.75} fill="none" />
                <Path d={paths.fc} stroke={c.retail} strokeWidth={2} strokeDasharray="5,4" fill="none" />
              </G>
            ) : null}
            <Line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke={c.muted} strokeWidth={1} strokeDasharray="2,3" />
            {d.med[d.asofIndex] != null ? (
              <Circle cx={x(d.asofIndex)} cy={y(d.med[d.asofIndex]!)} r={4.5} fill={c.retail} stroke={c.bg} strokeWidth={2} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Key color={c.retail} text={`${label} median`} />
        <Key color={c.band} text="Cheapest to dearest 10%" block />
        <Key color={c.tgp} text="Wholesale TGP" />
        <Key color={c.fan} text="Forecast 80% range" block />
      </View>
    </View>
  );
}

const val = (s: Series, i: number) => (s[i] == null ? null : (s[i] as number).toFixed(1) + 'c');

function tooltip(d: ChartData, i: number, label: string) {
  const parts: string[] = [];
  const med = val(d.med, i), fc = val(d.fc, i), p10 = val(d.p10, i), tgp = val(d.tgp, i);
  if (med) parts.push(`${label} median ${med}`);
  if (fc && i > d.asofIndex) parts.push(`forecast ${fc} (${val(d.lo, i)} to ${val(d.hi, i)})`);
  if (p10) parts.push(`cheapest 10% ${p10}`);
  if (tgp) parts.push(`wholesale ${tgp}`);
  return parts.length ? parts.join(' · ') : 'No data for this day';
}

function Key({ color, text, block }: { color: string; text: string; block?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 16, height: block ? 10 : 3, borderRadius: 2, backgroundColor: color }} />
      <T kind="small">{text}</T>
    </View>
  );
}
