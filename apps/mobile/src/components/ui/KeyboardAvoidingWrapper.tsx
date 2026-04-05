import React from 'react'
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native'

interface KeyboardAvoidingWrapperProps {
  children: React.ReactNode
  style?: ViewStyle
}

/**
 * Wraps screen content so the keyboard doesn't obscure inputs.
 * Uses 'padding' behavior on iOS (shifts the view up) and 'height' on Android.
 * The inner ScrollView ensures content is still scrollable and that taps outside
 * inputs dismiss the keyboard correctly via keyboardShouldPersistTaps="handled".
 */
export function KeyboardAvoidingWrapper({ children, style }: KeyboardAvoidingWrapperProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.outer, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
})

export default KeyboardAvoidingWrapper
