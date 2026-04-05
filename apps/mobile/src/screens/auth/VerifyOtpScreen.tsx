import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { StackNavigationProp } from '@react-navigation/stack'
import { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing } from '../../theme/tokens'
import { OtpInput } from '../../components/ui/OtpInput'
import { api, ApiError } from '../../services/api'
import { AuthStackParamList } from '../../navigation/AuthNavigator'

type VerifyOtpNavProp = StackNavigationProp<AuthStackParamList, 'VerifyOtp'>
type VerifyOtpRouteProp = RouteProp<AuthStackParamList, 'VerifyOtp'>

const RESEND_COUNTDOWN_SECONDS = 60

export function VerifyOtpScreen() {
  const navigation = useNavigation<VerifyOtpNavProp>()
  const route = useRoute<VerifyOtpRouteProp>()
  const { email } = route.params
  const { theme } = useTheme()

  // Countdown state: positive number = ticking, 0 = show Resend button
  const [countdown, setCountdown] = useState(RESEND_COUNTDOWN_SECONDS)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // OTP validation state
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')

  // Transient UI feedback for resend actions
  const [resendLoading, setResendLoading] = useState(false)
  const [resendError, setResendError] = useState('')
  const [resendConfirmation, setResendConfirmation] = useState(false)

  // Start (or restart) the 60-second countdown
  const startCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    setCountdown(RESEND_COUNTDOWN_SECONDS)
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    startCountdown()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startCountdown])

  // Called by OtpInput when all 6 digits are entered — validate immediately
  const handleOtpComplete = async (code: string) => {
    setOtpError('')
    setVerifying(true)
    try {
      await api.post<{ valid: boolean }>('/auth/check-otp', { email, otp: code })
      navigation.navigate('CreateProfile', { email, otp: code })
    } catch {
      setOtpError('Invalid or expired code. Check your email and try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setResendLoading(true)
    setResendError('')
    setResendConfirmation(false)

    try {
      await api.post<void>('/auth/register', { email })
      setResendConfirmation(true)
      startCountdown()
      // Hide confirmation banner after 3 seconds
      setTimeout(() => setResendConfirmation(false), 3000)
    } catch (err) {
      const e = err as ApiError
      if (e.statusCode === 429) {
        setResendError('Too many attempts, please try again later')
      } else {
        setResendError('Failed to resend code. Please try again.')
      }
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.container}>
        {/* Back arrow */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backArrow, { color: theme.textPrimary }]}>{'←'}</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            Check your inbox
          </Text>

          {/* Subtitle with email displayed in bold signal color */}
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {'We sent a 6-digit code to\n'}
            <Text style={[styles.emailHighlight, { color: colors.signal }]}>
              {email}
            </Text>
          </Text>

          {/* OTP input — auto-focuses, auto-advances, auto-submits on 6 digits */}
          <View style={styles.otpRow}>
            <OtpInput onComplete={handleOtpComplete} autoFocus />
          </View>

          {verifying ? (
            <Text style={[styles.confirmationText, { color: theme.textSecondary }]}>
              Verifying…
            </Text>
          ) : null}
          {otpError ? (
            <Text style={styles.errorText}>{otpError}</Text>
          ) : null}

          {/* Countdown / Resend section */}
          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={[styles.countdownText, { color: theme.textSecondary }]}>
                Resend code in {countdown}s
              </Text>
            ) : (
              <View style={styles.resendPrompt}>
                <Text style={[styles.resendPromptText, { color: theme.textSecondary }]}>
                  {"Didn't receive a code? "}
                </Text>
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resendLoading}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.resendLink, { color: colors.signal }]}>
                    {resendLoading ? 'Sending…' : 'Resend'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Brief "Code resent" confirmation message */}
          {resendConfirmation ? (
            <Text style={[styles.confirmationText, { color: colors.signal }]}>
              Code resent
            </Text>
          ) : null}

          {/* Resend failure error */}
          {resendError ? (
            <Text style={styles.errorText}>{resendError}</Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
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
  emailHighlight: {
    fontFamily: typography.fontFamily.bold,
  },
  otpRow: {
    marginBottom: spacing.xxxl,
  },
  resendRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  countdownText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
  },
  resendPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resendPromptText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
  },
  resendLink: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.sizes.base,
  },
  confirmationText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.danger,
    textAlign: 'center',
  },
})

export default VerifyOtpScreen
