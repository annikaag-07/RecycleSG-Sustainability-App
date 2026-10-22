// Palette sampled from the Lab 1 UI mockups (Lab 1/UI-Mockups). Dark-only by design.
export const colors = {
  // Surfaces
  background: '#0E1412',
  surface: '#141C19',
  surfaceRaised: '#1A2420',
  border: '#26312D',
  borderStrong: '#3A4642',

  // Text
  text: '#E8EDEB',
  textMuted: '#8F9C97',
  textFaint: '#66726D',

  // Primary action: light pill button with dark label
  primary: '#EEF1F0',
  onPrimary: '#0E1412',

  // Chips
  chip: '#1E2925',
  chipSelected: '#2C3A35',

  // Point types
  blueBin: '#2E5A9C',
  eWaste: '#E3C33A',
  onEWaste: '#1A1608',

  // Material icon tiles (point summary card)
  paper: '#3B6FB6',
  plastic: '#C0392B',
  glass: '#2F9E57',
  metal: '#A08A2C',

  // Status
  success: '#3FBF7F',
  warning: '#D9A441',
  danger: '#E5534B',
  dangerSurface: '#2E1513',
  dangerBorder: '#8C2E26',
  // "Not accepted here" chips on point detail
  notAcceptedChip: '#3A1A17',
  notAcceptedText: '#F08A80',

  // Map
  userDot: '#4A8BEA',

  singpass: '#F4333D',
} as const;

export type ColorName = keyof typeof colors;
