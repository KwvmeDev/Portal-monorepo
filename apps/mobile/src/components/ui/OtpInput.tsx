import React, { useRef, useState, useEffect } from 'react'
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, radius } from '../../theme/tokens'

interface OtpInputProps {
  onComplete: (code: string) => void
  length?: number
  autoFocus?: boolean
}

export function OtpInput({ onComplete, length = 6, autoFocus = true }: OtpInputProps) {
  const { theme } = useTheme()
  // digits[i] is '' (empty) or a single character
  const [digits, setDigits] = useState<string[]>(Array(length).fill(''))
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  // Refs array for programmatic focus control
  const inputRefs = useRef<(TextInput | null)[]>(Array(length).fill(null))

  useEffect(() => {
    if (autoFocus) {
      // Slight delay to let the screen fully mount before requesting focus
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [autoFocus])

  const handleChangeText = (text: string, index: number) => {
    // Accept only the last entered character (handles paste or rapid typing)
    const char = text.slice(-1)

    if (!char) {
      // Cleared via text change (non-backspace path)
      const updated = [...digits]
      updated[index] = ''
      setDigits(updated)
      return
    }

    // Only accept numeric input
    if (!/^\d$/.test(char)) return

    const updated = [...digits]
    updated[index] = char
    setDigits(updated)

    // Call onComplete immediately if all boxes are filled
    if (updated.every((d) => d !== '')) {
      onComplete(updated.join(''))
    }

    // Advance to next box if not at the last one
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    } else {
      // Dismiss keyboard on the last box
      inputRefs.current[index]?.blur()
    }
  }

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (event.nativeEvent.key === 'Backspace') {
      if (digits[index] === '') {
        // Current box is already empty — move focus back and clear previous
        if (index > 0) {
          const updated = [...digits]
          updated[index - 1] = ''
          setDigits(updated)
          inputRefs.current[index - 1]?.focus()
        }
      } else {
        // Clear current box (the TextInput onChange will also fire but digit is already '')
        const updated = [...digits]
        updated[index] = ''
        setDigits(updated)
      }
    }
  }

  return (
    <View style={styles.container}>
      {digits.map((digit, index) => {
        const isActive = focusedIndex === index
        return (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref
            }}
            style={[
              styles.box,
              {
                backgroundColor: theme.surface,
                borderColor: isActive ? colors.signal : theme.border,
                color: theme.textPrimary,
              },
            ]}
            value={digit}
            onChangeText={(text) => handleChangeText(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(-1)}
            keyboardType="number-pad"
            maxLength={2} // Allow 2 so we can slice the last char on rapid input
            textContentType="oneTimeCode"
            selectTextOnFocus
            caretHidden
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: 44,
    height: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: typography.fontFamily.bold,
  },
})

export default OtpInput
