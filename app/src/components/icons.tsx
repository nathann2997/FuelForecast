// Small in-screen icons drawn with react-native-svg (Material Symbols shapes), so they look the same on Android,
// iOS and the web preview. The tab bar keeps its native icons.
import Svg, { Path } from 'react-native-svg';

type P = { size?: number; color: string };

const PIN_FILLED =
  'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';
const PIN_OUTLINE =
  'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z';
const PLACE =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
const TUNE =
  'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z';

const Icon = ({ d, size = 20, color }: P & { d: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
    <Path d={d} fill={color} />
  </Svg>
);

export const PinIcon = ({ filled, ...p }: P & { filled?: boolean }) => <Icon d={filled ? PIN_FILLED : PIN_OUTLINE} {...p} />;
/** A map pin: "show on the map" (not the pin-to-favourites PinIcon) */
export const MapPinIcon = (p: P) => <Icon d={PLACE} {...p} />;
export const FilterIcon = (p: P) => <Icon d={TUNE} {...p} />;
