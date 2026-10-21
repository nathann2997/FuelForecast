// Palette carried over from the dashboard (sydney/pipeline/template.html :root tokens), plus the decision tones
// used by the app: act (fill now / this week), wait (prices falling), calm (no rush). See docs/DESIGN.md.
import { Platform } from 'react-native';

export const Colors = {
  light: {
    bg: '#f6f6f3', surface: '#ffffff', sunk: '#eeefeb', line: '#e2e3df', fg: '#141618', fg2: '#45494d', muted: '#6f7479',
    chip: '#ffb22e', onChip: '#141618',
    retail: '#eb6834', tgp: '#2a78d6', cheap: '#14865c', dear: '#c4511f',
    band: 'rgba(235,104,52,0.12)', fan: 'rgba(235,104,52,0.18)',
    up: '#b4361b', down: '#1f6e3a', flat: '#5e6266',
    actBg: '#fff3d6', actFg: '#7a4a00', actStrong: '#f0a000',
    waitBg: '#e4eefa', waitFg: '#1b5799', waitStrong: '#2a78d6',
    calmBg: '#eceeea', calmFg: '#3d4246', calmStrong: '#8a9096',
  },
  dark: {
    bg: '#0f1113', surface: '#181b1e', sunk: '#131618', line: '#2a2e33', fg: '#eef0f2', fg2: '#c2c7cc', muted: '#8b9197',
    chip: '#ffb22e', onChip: '#141618',
    retail: '#e5703f', tgp: '#3987e5', cheap: '#3cc28f', dear: '#f08a5d',
    band: 'rgba(217,89,38,0.16)', fan: 'rgba(255,178,46,0.16)',
    up: '#ff8a6b', down: '#8fdc9f', flat: '#a6abb0',
    actBg: '#2e2410', actFg: '#ffcf7a', actStrong: '#ffb22e',
    waitBg: '#122238', waitFg: '#9cc6f7', waitStrong: '#3987e5',
    calmBg: '#1d2124', calmFg: '#c2c7cc', calmStrong: '#8b9197',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const Spacing = { one: 4, two: 8, three: 12, four: 16, five: 24, six: 32 } as const;

export const Radius = { card: 16, chip: 999, input: 12 } as const;
