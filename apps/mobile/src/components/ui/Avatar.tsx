import React from 'react'
import { View, Image, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { typography } from '../../theme/tokens'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  uri?: string | null
  name?: string
  size?: AvatarSize
}

const SIZE_MAP: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
}

const TEXT_SIZE_MAP: Record<AvatarSize, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
}

/**
 * Derives initials from a display name.
 * Splits by whitespace, takes the first letter of each word, max 2 chars, uppercase.
 * Falls back to '?' when name is empty or undefined.
 */
function getInitials(name?: string): string {
  if (!name?.trim()) return '?'
  const words = name.trim().split(/\s+/)
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export function Avatar({ uri, name, size = 'md' }: AvatarProps) {
  const { theme } = useTheme()
  const dimension = SIZE_MAP[size]
  const fontSize = TEXT_SIZE_MAP[size]

  const circleStyle = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  }

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, circleStyle]}
        accessibilityLabel={name ? `${name}'s avatar` : 'User avatar'}
      />
    )
  }

  // Fallback: surface background with initials or person emoji
  const initials = name ? getInitials(name) : '👤'

  return (
    <View
      style={[
        styles.fallback,
        circleStyle,
        { backgroundColor: theme.surface },
      ]}
    >
      <Text
        style={[
          styles.initialsText,
          {
            fontSize,
            color: theme.textPrimary,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {initials}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initialsText: {
    fontFamily: typography.fontFamily.semiBold,
  },
})

export default Avatar
