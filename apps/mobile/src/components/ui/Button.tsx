import React, { useRef } from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Animated,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing, radius } from '../../theme/tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
  style?: ViewStyle
}

const SIZE_CONFIG: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 36, paddingHorizontal: 12, fontSize: 14 },
  md: { height: 44, paddingHorizontal: 16, fontSize: 15 },
  lg: { height: 52, paddingHorizontal: 20, fontSize: 16 },
}

export function Button({
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  style,
}: ButtonProps) {
  const { theme } = useTheme()
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start()
  }

  // Derive container and text styles from variant
  const variantContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: colors.signal }
      case 'secondary':
        return { backgroundColor: theme.surface }
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.signal,
        }
      case 'danger':
        return { backgroundColor: '#EF4444' }
    }
  }

  const textColor = (): string => {
    switch (variant) {
      case 'primary':
        return colors.void
      case 'secondary':
        return theme.textPrimary
      case 'ghost':
        return colors.signal
      case 'danger':
        return '#FFFFFF'
    }
  }

  const sizeConfig = SIZE_CONFIG[size]
  const resolvedTextColor = textColor()

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: disabled ? 0.5 : 1 }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[
          styles.base,
          variantContainerStyle(),
          {
            height: sizeConfig.height,
            paddingHorizontal: sizeConfig.paddingHorizontal,
          },
          style,
        ]}
      >
        {loading ? (
          // Show spinner centered, matching text color
          <ActivityIndicator color={resolvedTextColor} size="small" />
        ) : (
          <Text
            style={[
              styles.label,
              {
                color: resolvedTextColor,
                fontSize: sizeConfig.fontSize,
                // primary uses bold, others use semibold
                fontFamily: variant === 'primary' ? typography.fontFamily.bold : typography.fontFamily.semiBold,
              },
            ]}
          >
            {children}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  label: {
    fontFamily: typography.fontFamily.regular,
    textAlign: 'center',
  },
})

export default Button
