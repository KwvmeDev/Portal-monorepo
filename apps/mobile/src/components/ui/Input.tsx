import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  KeyboardTypeOptions,
} from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, radius } from '../../theme/tokens'

interface InputProps {
  label?: string
  placeholder?: string
  value: string
  onChangeText: (text: string) => void
  error?: string
  secureTextEntry?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  keyboardType?: KeyboardTypeOptions
  autoComplete?: string
  testID?: string
  editable?: boolean
  multiline?: boolean
  maxLength?: number
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  leftIcon,
  rightIcon,
  autoCapitalize = 'none',
  keyboardType,
  autoComplete,
  testID,
  editable = true,
  multiline = false,
  maxLength,
}: InputProps) {
  const { theme } = useTheme()
  const [isFocused, setIsFocused] = useState(false)
  // Internal visibility toggle state for password fields
  const [isSecureVisible, setIsSecureVisible] = useState(false)

  // When secureTextEntry is true and no rightIcon is provided, render the built-in toggle
  const showBuiltInToggle = secureTextEntry && !rightIcon

  // Resolved border color: red on error, signal on focus, default otherwise
  const borderColor = error
    ? '#EF4444'
    : isFocused
    ? colors.signal
    : theme.border

  // The actual secure prop: if password field, invert based on visibility toggle
  const resolvedSecure = secureTextEntry ? !isSecureVisible : false

  return (
    <View style={styles.wrapper}>
      {/* Label */}
      {label ? (
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      ) : null}

      {/* Input row */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.surface,
            borderColor,
            borderRadius: radius.md,
          },
        ]}
      >
        {/* Left icon slot */}
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}

        <TextInput
          style={[
            styles.textInput,
            {
              color: theme.textPrimary,
              fontFamily: typography.fontFamily.regular,
              // Adjust left padding when a left icon is present
              paddingLeft: leftIcon ? 4 : 14,
              // Adjust right padding when a right icon or toggle is present
              paddingRight: rightIcon || showBuiltInToggle ? 4 : 14,
            },
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={resolvedSecure}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          // autoComplete expects specific string literals; cast to avoid TS mismatch
          autoComplete={autoComplete as any}
          testID={testID}
          editable={editable}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {/* Right icon slot — consumer-provided icon takes priority */}
        {rightIcon ? (
          <View style={styles.iconRight}>{rightIcon}</View>
        ) : showBuiltInToggle ? (
          // Built-in eye toggle for password fields
          <TouchableOpacity
            onPress={() => setIsSecureVisible((v) => !v)}
            style={styles.iconRight}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ fontSize: 18 }}>{isSecureVisible ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Error message */}
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontFamily: typography.fontFamily.regular,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    // Vertical padding is handled inside TextInput style
  },
  textInput: {
    flex: 1,
    fontSize: typography.sizes.base,
    paddingVertical: 12,
    // horizontal padding set inline above based on icon presence
  },
  iconLeft: {
    paddingLeft: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRight: {
    paddingRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: '#EF4444',
    fontFamily: typography.fontFamily.regular,
  },
})

export default Input
