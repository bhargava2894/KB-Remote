export const colors = {
  // base / surface
  background: '#0B0B0F',
  surface: '#16161D',
  surfaceAlt: '#1F1F29',
  border: '#2A2A36',
  text: '#F2F2F5',
  textMuted: '#9A9AA8',

  // accents
  accent: '#4F8CFF',
  accentPurple: '#A855F7',
  accentPink: '#EC4899',
  power: '#3DDC84',
  danger: '#FF5C5C',
  warm: '#FFD66B',

  // brand
  netflix: '#E50914',
  netflixDark: '#8C000C',
  youtube: '#FF0000',
  youtubeDark: '#B40000',
  prime: '#00A8E1',
  primeDark: '#0064AA',

  // press state
  pressed: '#2E2E3D',

  // glass tokens — rgba so callers can compose alpha
  glassFill: 'rgba(255, 255, 255, 0.045)',
  glassFillStrong: 'rgba(255, 255, 255, 0.07)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassBorderStrong: 'rgba(255, 255, 255, 0.16)',
  glassHighlight: 'rgba(255, 255, 255, 0.18)',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
