import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { StackNavigationProp } from '@react-navigation/stack'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing } from '../../theme/tokens'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api, ApiError } from '../../services/api'
import { AuthStackParamList } from '../../navigation/AuthNavigator'

type RegisterNavProp = StackNavigationProp<AuthStackParamList, 'Register'>

// Matches local@domain.tld — good enough for format checks before server validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function RegisterScreen() {
  const navigation = useNavigation<RegisterNavProp>()
  const { theme } = useTheme()

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  // Show inline format error on every keystroke once the field is non-empty
  const handleEmailChange = (text: string) => {
    setEmail(text)
    // Clear any previous API-level error when the user edits
    setApiError('')
    if (text.length > 0 && !EMAIL_REGEX.test(text)) {
      setEmailError('Please enter a valid email')
    } else {
      setEmailError('')
    }
  }

  const isFormValid = email.length > 0 && EMAIL_REGEX.test(email)

  const handleContinue = async () => {
    if (!isFormValid) return

    setLoading(true)
    setApiError('')

    try {
      await api.post<void>('/auth/register', { email })
      // Pass email so VerifyOtp can display it and re-trigger the same endpoint on resend
      navigation.navigate('VerifyOtp', { email })
    } catch (err) {
      const e = err as ApiError
      console.error('[Register] raw error:', JSON.stringify(err, null, 2))
      if (e.statusCode === 409) {
        setApiError('An account with this email already exists')
      } else if (e.statusCode === 429) {
        setApiError('Too many attempts, please try again later')
      } else {
        setApiError(`[${e.statusCode ?? '?'}] ${e.message ?? String(err)}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back arrow — returns to Welcome */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: theme.textPrimary }]}>{'←'}</Text>
          </TouchableOpacity>

          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              Create your account
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Enter your email to get started
            </Text>

            <View style={styles.fieldRow}>
              <Input
                label="Email"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={emailError}
                placeholder="you@university.edu"
                testID="register-email-input"
              />
            </View>

            {/* API-level errors: 409 already registered, 429 rate limited, generic */}
            {apiError ? (
              <Text style={styles.apiError}>{apiError}</Text>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              onPress={handleContinue}
              loading={loading}
              disabled={!isFormValid || loading}
              style={styles.button}
            >
              Continue
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  backButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 24,
    fontFamily: typography.fontFamily.regular,
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    marginBottom: spacing.sm,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    marginBottom: spacing.xxxl,
    lineHeight: 22,
  },
  fieldRow: {
    marginBottom: spacing.lg,
  },
  apiError: {
    marginBottom: spacing.lg,
    fontSize: typography.sizes.sm,
    color: colors.danger,
    fontFamily: typography.fontFamily.regular,
  },
  button: {
    width: '100%',
  },
})

export default RegisterScreen
