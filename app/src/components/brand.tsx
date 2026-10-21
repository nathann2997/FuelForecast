import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

// Bowser brand mark and lockup. Geometry mirrors assets/brand/*.svg (see docs/BRAND.md); keep them in step.
// Mark: a "B" whose counters are a pump's price window and whose hose and nozzle hang off the top bowl.
const BODY =
  'M25 15H47A17 17 0 0 1 55.17 47.18A19.5 19.5 0 0 1 48.5 85H25A6 6 0 0 1 19 79V21A6 6 0 0 1 25 15Z' +
  'M33.5 26H45.5A2.5 2.5 0 0 1 48 28.5V35.5A2.5 2.5 0 0 1 45.5 38H33.5A2.5 2.5 0 0 1 31 35.5V28.5A2.5 2.5 0 0 1 33.5 26Z' +
  'M39 56H43A8 8 0 0 1 43 72H39A8 8 0 0 1 39 56Z';
const HOSE = 'M60.5 29Q77 29 77 45V60';
const NOZZLE = 'M73.5 58H80.5C80.5 62 82 63 82 66V72A5 5 0 0 1 72 72V66C72 63 73.5 62 73.5 58Z';
// "Bowser" as monoline centre-line strokes (cap height 70, stroke 12), so no font is needed
const WORD =
  'M6 64V6H20A14 14 0 0 1 20 34H6M20 34H23A15 15 0 0 1 23 64H6' +
  'M55 46A18 18 0 1 0 91 46A18 18 0 1 0 55 46' +
  'M107 28L118 64L128.5 37L139 64L150 28' +
  'M194 32.32C190 28 186 28 180.5 28C172 28 167 32.32 167 37.72C167 44.2 175 45 180.5 46C187 47 195 49 195 55' +
  'C195 61.12 188 64 180.5 64C173 64 168 61.84 166 58.24' +
  'M211 46H247A18 18 0 1 0 241.73 58.73' +
  'M263 64V28M263 45C263 34 270 28 281 28H283';
const LOCKUP_W = 376, LOCKUP_H = 70;

function MarkShapes({ color }: { color: string }) {
  return (
    <>
      <Path d={BODY} fill={color} fillRule="evenodd" />
      <Path d={HOSE} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Path d={NOZZLE} fill={color} />
    </>
  );
}

/** The Bowser mark, square. Amber by default; pass `color` for a single-colour use */
export function BowserMark({ size = 32, color }: { size?: number; color?: string }) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="13.5 13 74 74" accessibilityLabel="Bowser">
      <MarkShapes color={color ?? c.actStrong} />
    </Svg>
  );
}

/** Mark + "Bowser" lockup; `height` is the cap height of the word */
export function BowserWordmark({ height = 28, color }: { height?: number; color?: string }) {
  const c = useTheme();
  return (
    <Svg width={(height * LOCKUP_W) / LOCKUP_H} height={height} viewBox={`0 0 ${LOCKUP_W} ${LOCKUP_H}`} accessibilityLabel="Bowser">
      <G transform="translate(-19 -15)">
        <MarkShapes color={color ?? c.actStrong} />
      </G>
      <Path d={WORD} transform="translate(87 0)" fill="none" stroke={color ?? c.fg} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
