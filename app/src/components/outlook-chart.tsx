import { useState } from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { toneColors } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { addDays } from '@/lib/format';
import { dayLabel, path, type Tone } from '@/lib/outlook';
import type { LiveRow } from '@/lib/types';

// System sans for the labels; SVG text otherwise falls back to a serif on some renderers
const FONT = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' });
const H = 132, PAD = { l: 6, r: 6, t: 22, b: 22 };

/** The next 14 days at a glance: expected Sydney median with its 80% range, today's dot and the likely rise day */
export function OutlookChart({ r, asof, rise, tone }: { r: LiveRow; asof: string; rise: number | null; tone: Tone }) {
  const c = useTheme();
  const t = toneColors(c, tone);
  const [w, setW] = useState(0);
  const mid = path(r).map((d) => r.now + d);
  const lo = path(r, 'lo').map((d) => r.now + d);
  const hi = path(r, 'hi').map((d) => r.now + d);
  const min = Math.min(...lo, ...mid) - 1, max = Math.max(...hi, ...mid) + 1;
  const x = (h: number) => PAD.l + (h / 14) * (w - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  const line = mid.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band =
    hi.map((v, h) => `${h ? 'L' : 'M'}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('') +
    lo.map((v, h) => [h, v] as const).reverse().map(([h, v]) => `L${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('') + 'Z';
  const end = mid[14];

  return (
    <View
      style={{ height: H }}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="image"
      accessibilityLabel={`Expected Sydney median over 14 days: ${r.now.toFixed(1)}c today to about ${end.toFixed(1)}c${rise ? `, likely rising from ${dayLabel(addDays(asof, rise))}` : ''}`}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Path d={band} fill={t.strong} opacity={0.16} />
          {rise != null ? (
            <>
              <Line x1={x(rise)} x2={x(rise)} y1={PAD.t - 6} y2={H - PAD.b} stroke={t.strong} strokeWidth={1.5} strokeDasharray="3,3" />
              <SvgText x={x(rise)} y={PAD.t - 10} fill={t.fg} fontSize={11} fontWeight="700" fontFamily={FONT}
                textAnchor={rise <= 2 ? 'start' : rise >= 12 ? 'end' : 'middle'}>{`Rise ${dayLabel(addDays(asof, rise))}`}</SvgText>
            </>
          ) : null}
          <Path d={line} stroke={t.strong} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(0)} cy={y(mid[0])} r={4.5} fill={t.strong} stroke={c.surface} strokeWidth={2} />
          <Circle cx={x(14)} cy={y(end)} r={3} fill={t.strong} />
          <SvgText x={x(0)} y={H - 6} fill={c.muted} fontSize={11} fontFamily={FONT} textAnchor="start">Today</SvgText>
          <SvgText x={x(7)} y={H - 6} fill={c.muted} fontSize={11} fontFamily={FONT} textAnchor="middle">{dayLabel(addDays(asof, 7))}</SvgText>
          <SvgText x={x(14)} y={H - 6} fill={c.muted} fontSize={11} fontFamily={FONT} textAnchor="end">{dayLabel(addDays(asof, 14))}</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
