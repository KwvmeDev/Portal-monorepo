import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { StackNavigationProp } from '@react-navigation/stack'
import { useTheme } from '../../theme/useTheme'
import { typography, spacing, radius, colors } from '../../theme/tokens'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { api } from '../../services/api'
import { AuthStackParamList } from '../../navigation/AuthNavigator'

type ForgotPasswordNavProp = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>

interface Props {
  navigation: ForgotPasswordNavProp
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function ForgotPasswordScreen({ navigation }: Props) {
  const { theme } = useTheme()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  // Shown after any API response (success or error) — avoids account enumeration
  const [submitted, setSubmitted] = useState(false)
  const [emailError, setEmailError] = useState('')

  const handleSendCode = async () => {
    if (!email.trim()) {
      setEmailError('Email is required')
      return
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address')
      return
    }

    setEmailError('')
    setLoading(true)

    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
    } catch {
      // Intentionally swallow — spec requires showing the info box regardless of
      // success or error to prevent leaking account existence (security best practice)
    } finally {
      setLoading(false)
      setSubmitted(true)
    }
  }

  const handleContinue = () => {
    navigation.navigate('ResetPassword', { email: email.trim().toLowerCase() })
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
          {/* Back arrow — returns to Login */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.backArrow, { color: theme.textPrimary }]}>{'←'}</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Reset password</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Enter your email and we'll send you a reset code
            </Text>
          </View>

          {/* Email field — locked after submission */}
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="you@university.edu"
              value={email}
              onChangeText={(text) => {
                setEmail(text)
                if (emailError) setEmailError('')
              }}
              error={emailError}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!submitted}
            />

            {/* Primary CTA — hidden once submitted to replace with Continue */}
            {!submitted && (
              <Button
                variant="primary"
                size="lg"
                loading={loading}
                disabled={loading}
                onPress={handleSendCode}
                style={styles.fullWidth}
              >
                Send code
              </Button>
            )}
          </View>

          {/* Info box — always shown after any response (spec requirement) */}
          {submitted && (
            <>
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: theme.surface,
                    borderColor: colors.signal,
                  },
                ]}
              >
                <Text style={[styles.infoText, { color: theme.textPrimary }]}>
                  If that email exists, you'll receive a reset code shortly.
                </Text>
              </View>

              <Button
                variant="primary"
                size="lg"
                onPress={handleContinue}
                style={styles.fullWidth}
              >
                Continue to reset
              </Button>
            </>
          )}
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
  form: {
    gap: spacing.lg,
  },
  fullWidth: {
    width: '100%',
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  infoText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 22,
  },
})

export default ForgotPasswordScreen
