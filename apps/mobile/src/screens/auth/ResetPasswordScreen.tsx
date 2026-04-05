import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
} from 'react-native'
import { StackNavigationProp } from '@react-navigation/stack'
import { RouteProp } from '@react-navigation/native'
import { useTheme } from '../../theme/useTheme'
import { typography, spacing, radius, colors } from '../../theme/tokens'
import { OtpInput } from '../../components/ui/OtpInput'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { api, ApiError } from '../../services/api'
import { AuthStackParamList } from '../../navigation/AuthNavigator'

type ResetPasswordNavProp = StackNavigationProp<AuthStackParamList, 'ResetPassword'>
type ResetPasswordRouteProp = RouteProp<AuthStackParamList, 'ResetPassword'>

interface Props {
  navigation: ResetPasswordNavProp
  route: ResetPasswordRouteProp
}

// Minimum password strength: 8+ chars with at least one letter and one number
function isStrongPassword(value: string): boolean {
  return value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value)
}

export function ResetPasswordScreen({ navigation, route }: Props) {
  const { email } = route.params
  const { theme } = useTheme()

  const [otp, setOtp] = useState('')
  const [otpComplete, setOtpComplete] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Animate the password form in after OTP is filled
  const passwordFormOpacity = useRef(new Animated.Value(0)).current
  const passwordFormTranslate = useRef(new Animated.Value(12)).current

  useEffect(() => {
    if (otpComplete) {
      Animated.parallel([
        Animated.timing(passwordFormOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(passwordFormTranslate, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [otpComplete, passwordFormOpacity, passwordFormTranslate])

  const handleOtpComplete = (code: string) => {
    setOtp(code)
    setOtpComplete(true)
    // Clear any previous API error when user re-enters OTP
    if (apiError) setApiError('')
  }

  const passwordsMatch = password === confirmPassword
  const passwordStrong = isStrongPassword(password)

  // Button is enabled only when all fields are valid
  const canSubmit =
    otpComplete &&
    otp.length === 6 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    passwordStrong &&
    !loading

  const handleResetPassword = async () => {
    if (!canSubmit) return

    setApiError('')
    setLoading(true)

    try {
      await api.post('/auth/reset-password', {
        email,
        otp,
        newPassword: password,
      })

      setSuccessMessage('Password reset successfully!')

      // Navigate to Login after 1.5s so user sees the success message
      setTimeout(() => {
        navigation.navigate('Login')
      }, 1500)
    } catch (err) {
      const apiErr = err as ApiError

      if (apiErr.statusCode === 429) {
        setApiError('Too many attempts. Please wait before trying again.')
      } else if (apiErr.statusCode === 400) {
        setApiError('Invalid or expired code. Please request a new one.')
      } else {
        setApiError(apiErr.message ?? 'Something went wrong. Please try again.')
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
          {/* Back arrow — returns to ForgotPassword */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: theme.textPrimary }]}>{'←'}</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Enter reset code</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {'Enter the code sent to '}
              <Text style={[styles.subtitleEmail, { color: theme.textPrimary }]}>{email}</Text>
            </Text>
          </View>

          {/* 6-digit OTP input */}
          <View style={styles.otpContainer}>
            <OtpInput onComplete={handleOtpComplete} length={6} autoFocus />
          </View>

          {/* Password form — animates in once OTP is complete */}
          {otpComplete && (
            <Animated.View
              style={[
                styles.passwordForm,
                {
                  opacity: passwordFormOpacity,
                  transform: [{ translateY: passwordFormTranslate }],
                },
              ]}
            >
              <Input
                label="New password"
                placeholder="At least 8 characters"
                value={password}
                onChangeText={(text) => {
                  setPassword(text)
                  if (apiError) setApiError('')
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                error={
                  password.length > 0 && !passwordStrong
                    ? 'Password must be 8+ characters with a letter and a number'
                    : undefined
                }
              />

              <Input
                label="Confirm new password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text)
                  if (apiError) setApiError('')
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                error={
                  confirmPassword.length > 0 && !passwordsMatch
                    ? 'Passwords do not match'
                    : undefined
                }
              />
            </Animated.View>
          )}

          {/* Inline API error */}
          {apiError.length > 0 && (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: theme.surface,
                  borderColor: colors.danger,
                },
              ]}
            >
              <Text style={styles.errorBoxText}>{apiError}</Text>
            </View>
          )}

          {/* Success message */}
          {successMessage.length > 0 && (
            <View
              style={[
                styles.successBox,
                {
                  backgroundColor: theme.surface,
                  borderColor: colors.signal,
                },
              ]}
            >
              <Text style={[styles.successText, { color: colors.signal }]}>{successMessage}</Text>
            </View>
          )}

          {/* Submit button */}
          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!canSubmit}
            onPress={handleResetPassword}
            style={styles.submitButton}
          >
            Reset password
          </Button>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  backButton: {
    marginBottom: spacing.xl,
    alignSelf: 'flex-start',
  },
  backArrow: {
    fontSize: 24,
    fontFamily: typography.fontFamily.regular,
  },
  header: {
    marginBottom: spacing.xxxl,
  },
  title: {
    fontSize: 28,
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 22,
  },
  subtitleEmail: {
    fontFamily: typography.fontFamily.semiBold,
  },
  otpContainer: {
    marginBottom: spacing.xxxl,
    alignItems: 'center',
  },
  passwordForm: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBoxText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.danger,
    lineHeight: 20,
  },
  successBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    textAlign: 'center',
  },
  submitButton: {
    width: '100%',
    marginTop: spacing.md,
  },
})

export default ResetPasswordScreen
