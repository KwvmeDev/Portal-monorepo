import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { StackScreenProps } from '@react-navigation/stack'
import type { AuthStackParamList } from '../../navigation/AuthNavigator'
import { useTheme } from '../../theme/useTheme'
import { colors, spacing, typography, radius } from '../../theme/tokens'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import type { User } from '@portal/types'

// ─── Types ───────────────────────────────────────────────────────────────────

type Props = StackScreenProps<AuthStackParamList, 'CreateProfile'>

type PasswordStrength = 'none' | 'weak' | 'fair' | 'strong'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'

interface VerifyEmailResponse {
  accessToken: string
  refreshToken: string
  user: User
}

interface CheckUsernameResponse {
  available: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derives password strength from a raw password string.
 * - none:   empty
 * - weak:   < 8 chars OR missing both a digit and a special character
 * - fair:   >= 8 chars with EITHER a digit OR a special character
 * - strong: >= 8 chars with BOTH a digit AND a special character
 */
function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return 'none'
  if (password.length < 8) return 'weak'
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)
  if (hasNumber && hasSpecial) return 'strong'
  if (hasNumber || hasSpecial) return 'fair'
  return 'weak'
}

// ─── Sub-component: Password strength bar ────────────────────────────────────

interface StrengthBarProps {
  strength: PasswordStrength
}

function PasswordStrengthBar({ strength }: StrengthBarProps) {
  // Resolve how many segments are filled and which color to use
  const filledCount = strength === 'strong' ? 3 : strength === 'fair' ? 2 : strength === 'weak' ? 1 : 0
  const segmentColor =
    strength === 'strong'
      ? '#4CD964'
      : strength === 'fair'
      ? '#F59E0B'
      : '#EF4444'

  return (
    <View style={strengthBarStyles.row}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            strengthBarStyles.segment,
            {
              // Filled segments use the derived color; unfilled use a dim border color
              backgroundColor: i < filledCount ? segmentColor : '#2A2A2A',
            },
          ]}
        />
      ))}
    </View>
  )
}

const strengthBarStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 8,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
})

// ─── Main screen ─────────────────────────────────────────────────────────────

export function CreateProfileScreen({ route, navigation }: Props) {
  const { email, otp } = route.params
  const { theme } = useTheme()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)

  // --- Form state ---
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null)

  // --- Derived state ---
  const passwordStrength = getPasswordStrength(password)
  const confirmError = confirmPassword.length > 0 && password !== confirmPassword
    ? 'Passwords do not match'
    : undefined

  // --- Username availability state ---
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- Submit state ---
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Username availability check with 400ms debounce ─────────────────────

  const checkUsername = useCallback(async (value: string) => {
    if (!value.trim()) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    try {
      const result = await api.get<CheckUsernameResponse>(
        `/auth/check-username?username=${encodeURIComponent(value)}`,
      )
      setUsernameStatus(result.available ? 'available' : 'taken')
    } catch {
      // On network failure, reset to idle so the form is not permanently blocked
      setUsernameStatus('idle')
    }
  }, [])

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    // Reset status immediately when the field changes so stale indicator is cleared
    setUsernameStatus(username.trim() ? 'checking' : 'idle')
    debounceTimer.current = setTimeout(() => {
      checkUsername(username)
    }, 400)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [username, checkUsername])

  // ── Avatar picker ────────────────────────────────────────────────────────

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to choose a profile photo.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets.length > 0) {
      setAvatarLocalUri(result.assets[0].uri)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  const isFormValid =
    password.length >= 8 &&
    password === confirmPassword &&
    username.trim().length > 0 &&
    usernameStatus === 'available'

  const handleContinue = async () => {
    if (!isFormValid || isSubmitting) return
    setIsSubmitting(true)
    try {
      // Avatar upload is stubbed — avatarUrl will be null until upload is implemented
      const response = await api.post<VerifyEmailResponse>('/auth/verify-email', {
        email,
        otp,
        password,
        username: username.trim(),
        displayName: displayName.trim(),
      })
      await setTokens(response.accessToken, response.refreshToken)
      setUser(response.user)
      navigation.navigate('SelectUniversity')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      Alert.alert('Error', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Username right icon ──────────────────────────────────────────────────

  const usernameRightIcon = (): React.ReactNode => {
    if (usernameStatus === 'checking') {
      return <ActivityIndicator size="small" color={theme.textSecondary} />
    }
    if (usernameStatus === 'available') {
      return (
        <Text style={{ color: colors.signal, fontSize: 16, fontWeight: '700' }}>
          {'✓'}
        </Text>
      )
    }
    if (usernameStatus === 'taken') {
      return (
        <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '700' }}>
          {'✗'}
        </Text>
      )
    }
    return null
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Section 1: Password ── */}
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
        CREATE A PASSWORD
      </Text>

      <Input
        label="Password"
        placeholder="Enter password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        testID="password-input"
      />

      <PasswordStrengthBar strength={passwordStrength} />

      <View style={styles.fieldGap} />

      <Input
        label="Confirm password"
        placeholder="Re-enter password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        error={confirmError}
        testID="confirm-password-input"
      />

      {/* ── Section 2: Identity ── */}
      <View style={styles.sectionGap} />
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
        YOUR IDENTITY
      </Text>

      {/* Display name with character count shown via rightIcon */}
      <View>
        <Input
          label="Display name"
          placeholder="How should we call you?"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          maxLength={50}
          rightIcon={
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {displayName.length}/50
            </Text>
          }
          testID="display-name-input"
        />
      </View>

      <View style={styles.fieldGap} />

      <Input
        label="Username"
        placeholder="your_handle"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoComplete="username-new"
        leftIcon={
          <Text style={{ color: theme.textSecondary, fontSize: 15 }}>@</Text>
        }
        rightIcon={usernameRightIcon()}
        testID="username-input"
      />

      {/* ── Section 3: Avatar ── */}
      <View style={styles.sectionGap} />
      <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
        PROFILE PHOTO
      </Text>

      <View style={styles.avatarSection}>
        {/* Circular avatar with camera badge */}
        <TouchableOpacity
          onPress={handlePickAvatar}
          activeOpacity={0.8}
          style={styles.avatarTouchable}
          accessibilityLabel="Choose profile photo"
        >
          <View
            style={[
              styles.avatarCircle,
              {
                backgroundColor: theme.surface,
                borderColor: colors.signal,
              },
            ]}
          >
            {avatarLocalUri ? (
              <Image
                source={{ uri: avatarLocalUri }}
                style={styles.avatarImage}
                accessibilityLabel="Selected profile photo"
              />
            ) : (
              <Text style={{ fontSize: 32 }}>{'👤'}</Text>
            )}
          </View>

          {/* Camera badge overlay at bottom-right */}
          <View
            style={[
              styles.cameraBadge,
              { backgroundColor: colors.signal },
            ]}
          >
            <Text style={{ fontSize: 12 }}>{'📷'}</Text>
          </View>
        </TouchableOpacity>

        {/* Skip link */}
        <TouchableOpacity
          onPress={() => setAvatarLocalUri(null)}
          accessibilityLabel="Skip profile photo"
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
        >
          <Text style={[styles.skipText, { color: theme.textMuted }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Submit ── */}
      <Button
        variant="primary"
        size="lg"
        disabled={!isFormValid || isSubmitting}
        loading={isSubmitting}
        onPress={handleContinue}
        style={styles.continueButton}
      >
        Continue
      </Button>

      {/* Bottom padding so content clears the keyboard */}
      <View style={styles.bottomPad} />
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 56 : spacing.xxxl,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionGap: {
    height: spacing.xxxl,
  },
  fieldGap: {
    height: spacing.lg,
  },
  // Avatar section
  avatarSection: {
    alignItems: 'center',
    marginTop: 4,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    marginTop: spacing.md,
    fontSize: 14,
    fontFamily: typography.fontFamily.regular,
  },
  continueButton: {
    width: '100%',
    marginTop: spacing.xxxl,
  },
  bottomPad: {
    height: 40,
  },
})

export default CreateProfileScreen
