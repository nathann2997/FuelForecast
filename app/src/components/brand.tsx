import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

// Bowser brand mark and lockup. Geometry mirrors docs/brand/render-brand.mjs, which writes assets/brand/*.svg and the
// icon PNGs (see docs/BRAND.md); keep them in step.
// Mark: a fuel drop with a down arrow cut out of it (the price is about to drop).
const MARK =
  'M50 10C58 22 78 40 78 62A28 28 0 0 1 22 62C22 40 42 22 50 10Z' +
  'M45.5 42A4.5 4.5 0 0 1 54.5 42V63.14L59.82 57.82A4.5 4.5 0 0 1 66.18 64.18L53.18 77.18A4.5 4.5 0 0 1 46.82 77.18' +
  'L33.82 64.18A4.5 4.5 0 0 1 40.18 57.82L45.5 63.14Z';
// "Bowser" as monoline centre-line strokes (cap height 70 incl. stroke 12), so no font is needed
const WORD =
  'M6 64V6H20A14 14 0 0 1 20 34H6M20 34H23A15 15 0 0 1 23 64H6' +
  'M55 46A18 18 0 1 0 91 46A18 18 0 1 0 55 46' +
  'M107 28L118 64L128.5 37L139 64L150 28' +
  'M194 32.32C190 28 186 28 180.5 28C172 28 167 32.32 167 37.72C167 44.2 175 45 180.5 46C187 47 195 49 195 55' +
  'C195 61.12 188 64 180.5 64C173 64 168 61.84 166 58.24' +
  'M211 46H247A18 18 0 1 0 241.73 58.73' +
  'M263 64V28M263 45C263 34 270 28 281 28H283';
const LOCKUP_W = 369, LOCKUP_H = 80;

function MarkShape({ color }: { color: string }) {
  return <Path d={MARK} fill={color} fillRule="evenodd" />;
}

/** The Bowser mark, square. Amber by default; pass `color` for a single-colour use */
export function BowserMark({ size = 32, color }: { size?: number; color?: string }) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="9 9 82 82" accessibilityLabel="Bowser">
      <MarkShape color={color ?? c.actStrong} />
    </Svg>
  );
}

/** Mark + "Bowser" lockup; `height` is the mark's height (the word is centred on it, slightly shorter) */
export function BowserWordmark({ height = 28, color }: { height?: number; color?: string }) {
  const c = useTheme();
  return (
    <Svg width={(height * LOCKUP_W) / LOCKUP_H} height={height} viewBox={`0 0 ${LOCKUP_W} ${LOCKUP_H}`} accessibilityLabel="Bowser">
      <G transform="translate(-22 -10)">
        <MarkShape color={color ?? c.actStrong} />
      </G>
      <Path d={WORD} transform="translate(79 5)" fill="none" stroke={color ?? c.fg} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
