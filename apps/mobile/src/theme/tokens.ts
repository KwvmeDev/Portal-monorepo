export const colors = {
  void: '#010101',
  signal: '#4CD964',
  surface: '#181818',
  paper: '#F5F5F3',
  muted: '#6B6B6B',
  border: '#2A2A2A',
  upvote: '#4CD964',
  downvote: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  danger: '#EF4444',
} as const

export const dark = {
  bg: '#010101',
  bgSecondary: '#181818',
  surface: '#181818',
  surfaceElevated: '#212121',
  border: '#2A2A2A',
  textPrimary: '#F5F5F3',
  textSecondary: '#A0A0A0',
  textMuted: '#6B6B6B',
} as const

export const light = {
  bg: '#F5F5F3',
  bgSecondary: '#EFEFED',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E0E0DE',
  textPrimary: '#010101',
  textSecondary: '#4B4B4B',
  textMuted: '#8B8B8B',
} as const

export const typography = {
  fontFamily: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    black: 'Inter_900Black',
  } as const,
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
  sizes: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    display: 32,
  },
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 16,
  pill: 999,
} as const

export type ThemePalette = typeof dark
export type ColorTokens = typeof colors
