// Séance design system — single source of truth for colors, spacing, radii, fonts.

export const C = {
  // --- Background darks ---
  bgDeep: '#0c0908',
  bgBase: '#100c0a',
  bgAlt: '#0e0a08',
  bgCard: '#0f0b09',

  // --- Warm cream (Capture screen only) ---
  creamLight: '#F4ECDA',
  creamMid: '#E6DBC4',
  creamBright: '#F6EFE0',
  creamDark: '#F2E9D6',
  creamPage: '#EDE4CA',

  // --- Amber / gold ---
  amber: '#B8923C',
  amberBright: '#D6A94B',
  amberDeep: '#C9A43B',

  // --- Red-orange (primary CTA) ---
  red: '#D93D1A',
  redDark: '#9E2A10',
  redDeeper: '#7A1F0C',
  ember: '#FF5A38', // bright glow — agent speaking, auras, channeling accents

  // --- Teal ---
  teal: '#34B7A0',
  tealDeep: '#0F6B5C',

  // --- Dark surfaces (channeling / conversation screens) ---
  surface: '#2B241E', // raised UI on dark: tracks, user bubbles, avatar wells
  surfaceDeep: '#1A120D', // deepest wells: portrait/photo placeholders
  hairline: '#3A3128', // borders/dividers on dark
  inkFaint: '#5A4F42', // faintest mono text / idle states on dark

  // --- Text ---
  textLight: '#F0E7D6',
  textDark: '#1C1813',
  textDim: '#A89A86',
  textDimmer: '#9b8e76',
  textDimmest: '#8A7C68',
  textMuted: '#6B6052',

  // --- Misc ---
  separator: 'rgba(184,146,60,0.25)',
  overlayDark: 'rgba(12,9,8,0.72)',
} as const;

export const SP = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const R = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

export const FONTS = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;
