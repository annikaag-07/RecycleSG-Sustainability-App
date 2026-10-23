import type { TextStyle } from 'react-native';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// System font for now; swap `family` for IBM Plex Sans (closest to the mockups) once a font package is approved.
const family = undefined;

export const typography = {
  title: { fontFamily: family, fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontFamily: family, fontSize: 20, fontWeight: '700' },
  body: { fontFamily: family, fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyStrong: { fontFamily: family, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  small: { fontFamily: family, fontSize: 14, fontWeight: '400', lineHeight: 20 },
  // Uppercase section labels, e.g. "TAKE IT TO", "ACCEPTED HERE"
  label: { fontFamily: family, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  caption: { fontFamily: family, fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
