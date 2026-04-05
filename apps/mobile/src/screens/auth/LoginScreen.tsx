import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { colors, typography, spacing } from '../../theme/tokens'
import { useTheme } from '../../theme/useTheme'
import { api, type ApiError } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'

type Props = StackScreenProps<AuthStackParamList, 'Login'>

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: any
}

// Map API error codes/status to human-readable messages
function resolveErrorMessage(err: unknown): string {
  const apiErr = err as ApiError
  if (!apiErr?.statusCode) return 'Something went wrong. Please try again.'

  if (apiErr.statusCode === 401) {
    return 'Invalid email or password.'
  }

  if (apiErr.statusCode === 403 && apiErr.code === 'account_banned') {
    // Server may embed ban reason in the message field
    const banReason = apiErr.message ?? 'Contact support for details.'
    return `Your account has been banned: ${banReason}`
  }

  if (apiErr.statusCode === 429) {
    return 'Too many attempts. Please try again later.'
  }

  return apiErr.message ?? 'Something went wrong. Please try again.'
}

export function LoginScreen({ navigation }: Props) {
  const { theme } = useTheme()
  const { setTokens, setUser, completeOnboarding } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    // Clear any previous error before a new attempt
    setError(null)

    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    try {
      const data = await api.post<LoginResponse>('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      })
      // Persist tokens via the store, which also updates isAuthenticated
      await setTokens(data.accessToken, data.refreshToken)
      setUser(data.user)
      // Returning users have already completed onboarding — unblock AppNavigator
      completeOnboarding()
    } catch (err) {
      setError(resolveErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.void }]}>
      {/* Back arrow — navigator has headerShown:false so we provide our own */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.backArrow, { color: theme.textPrimary }]}>{'←'}</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text style={[styles.title, { color: theme.textPrimary }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Sign in to your account
          </Text>

          {/* Form fields */}
          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
            />

            <View style={styles.passwordRow}>
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
            </View>

            {/* Forgot password — right-aligned, signal colour */}
            <TouchableOpacity
              style={styles.forgotContainer}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={[styles.forgotText, { color: colors.signal }]}>
                Forgot password?
              </Text>
            </TouchableOpacity>

            {/* Primary CTA */}
            <Button
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading}
              style={styles.buttonFull}
              onPress={handleSignIn}
            >
              Sign in
            </Button>

            {/* Inline error display */}
            {error !== null ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : null}
          </View>

          {/* Bottom link to Register */}
          <View style={styles.registerLinkRow}>
            <Text style={[styles.registerPrompt, { color: theme.textSecondary }]}>
              {"Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={[styles.registerLink, { color: colors.signal }]}>
                Create one
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 24,
    lineHeight: 28,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    marginBottom: 32,
  },
  form: {
    gap: spacing.md,
  },
  passwordRow: {
    // Provides the standard gap between email and password fields
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },
  forgotText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
  },
  buttonFull: {
    width: '100%',
    marginTop: spacing.xxl,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  registerLinkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  registerPrompt: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
  },
  registerLink: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 14,
  },
})
