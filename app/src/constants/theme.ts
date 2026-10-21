// Palette carried over from the dashboard (sydney/pipeline/template.html :root tokens).
import { Platform } from 'react-native';

export const Colors = {
  light: {
    bg: '#fbfbfa', surface: '#f1f2f0', line: '#dfe1dd', fg: '#141618', fg2: '#45494d', muted: '#767b80',
    board: '#16191c', boardFg: '#eef0f2', boardMuted: '#9aa1a8', digit: '#ffb22e', chip: '#ffb22e', onChip: '#141618',
    retail: '#eb6834', tgp: '#2a78d6', cheap: '#1baf7a', dear: '#eb6834',
    band: 'rgba(235,104,52,0.12)', fan: 'rgba(235,104,52,0.18)',
    up: '#b4361b', down: '#1f6e3a', flat: '#5e6266',
  },
  dark: {
    bg: '#101214', surface: '#181b1e', line: '#2a2e33', fg: '#eef0f2', fg2: '#c2c7cc', muted: '#8b9197',
    board: '#05070a', boardFg: '#eef0f2', boardMuted: '#8b9197', digit: '#ffb22e', chip: '#ffb22e', onChip: '#141618',
    retail: '#d95926', tgp: '#3987e5', cheap: '#199e70', dear: '#d95926',
    band: 'rgba(217,89,38,0.16)', fan: 'rgba(255,178,46,0.16)',
    up: '#ff8a6b', down: '#8fdc9f', flat: '#a6abb0',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const Spacing = { one: 4, two: 8, three: 12, four: 16, five: 24, six: 32 } as const;
