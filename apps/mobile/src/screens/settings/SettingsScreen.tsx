/**
 * SettingsScreen — account settings, notifications preference, and danger zone.
 *
 * Sections:
 *   1. Account — Change Password (POST /api/auth/change-password)
 *   2. Notifications — Push Notifications toggle, persisted in AsyncStorage
 *   3. Danger Zone — Delete Account (DELETE /api/users/me → logout)
 *
 * Uses the useMutation pattern for the password change call so the button
 * state (loading / error) is fully controlled by React Query.
 */
import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useLanguage } from '../../i18n/LanguageContext'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import type { ApiError } from '../../services/api'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { ProfileStackParamList } from '../../navigation/AppNavigator'

// ---------------------------------------------------------------------------
// AsyncStorage key for the push notifications preference
// ---------------------------------------------------------------------------

const PUSH_ENABLED_KEY = 'pushEnabled'

// ---------------------------------------------------------------------------
// SettingsScreen
// ---------------------------------------------------------------------------

export function SettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<ProfileStackParamList>>()
  const { t } = useLanguage()
  // Read current user to conditionally show the super_admin-only Admin Panel row
  const user = useAuthStore((s) => s.user)

  // ── Change Password state ────────────────────────────────────────────────

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  // Inline error message shown below the Change Password button on 400 responses
  const [passwordError, setPasswordError] = useState<string | null>(null)

  // ── Push Notifications state ─────────────────────────────────────────────

  const [pushEnabled, setPushEnabled] = useState(true)

  // Load stored push preference on mount; default to true if key has never been set
  useEffect(() => {
    AsyncStorage.getItem(PUSH_ENABLED_KEY).then((stored) => {
      // null means the key has never been written — treat as enabled (default)
      if (stored !== null) {
        setPushEnabled(stored === 'true')
      }
    })
  }, [])

  // ── Change Password mutation ─────────────────────────────────────────────

  const { mutate: changePassword, isPending: isChangingPassword } = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setPasswordError(null)
      setCurrentPassword('')
      setNewPassword('')
      Alert.alert('Success', 'Password changed')
    },
    onError: (err: unknown) => {
      // Show the server-provided message for 400 errors; generic fallback otherwise
      const apiErr = err as ApiError
      if (apiErr?.statusCode === 400) {
        setPasswordError(apiErr.message ?? 'Invalid request. Please check your inputs.')
      } else {
        setPasswordError('Something went wrong. Please try again.')
      }
    },
  })

  // ── Push toggle handler ──────────────────────────────────────────────────

  function handlePushToggle(newValue: boolean) {
    setPushEnabled(newValue)
    // Persist locally — the app reads this on startup to decide whether to
    // request / display notifications. No server call is needed here.
    AsyncStorage.setItem(PUSH_ENABLED_KEY, String(newValue))
  }

  // ── Delete Account handler ───────────────────────────────────────────────

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // api.del maps to DELETE /api/users/me
              await api.del('/users/me')
            } catch {
              // Even if the server call fails, proceed with local logout so the
              // user is not stuck in a broken authenticated state. The server
              // can clean up orphaned accounts via a background job.
            }
            // Always log out regardless of server response
            await useAuthStore.getState().logout()
          },
        },
      ],
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{t('settings')}</Text>

          {/* Spacer keeps title centred */}
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Section 0 — Admin (super_admin only)                          */}
          {/* ══════════════════════════════════════════════════════════════ */}

          {user?.role === 'super_admin' && (
            <>
              <Text style={styles.sectionTitle}>Administration</Text>
              <View style={[styles.card, styles.adminCardSpacingBottom]}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Admin')}
                  activeOpacity={0.8}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Open admin panel"
                >
                  <Text style={styles.adminIcon}>🛡️</Text>
                  <Text style={styles.rowLabel}>Admin Panel</Text>
                  <Text style={styles.rowChevron}>›</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Section 1 — Account                                           */}
          {/* ══════════════════════════════════════════════════════════════ */}

          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.card}>
            <Text style={styles.subsectionTitle}>{t('changePassword')}</Text>

            <TextInput
              value={currentPassword}
              onChangeText={(v) => {
                setCurrentPassword(v)
                // Clear inline error when the user starts typing again
                if (passwordError) setPasswordError(null)
              }}
              secureTextEntry
              placeholder="Current password"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Current password"
            />

            <TextInput
              value={newPassword}
              onChangeText={(v) => {
                setNewPassword(v)
                if (passwordError) setPasswordError(null)
              }}
              secureTextEntry
              placeholder="New password (min 8 chars)"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inputSpacingTop]}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="New password"
            />

            <TouchableOpacity
              onPress={() => changePassword()}
              disabled={isChangingPassword || !currentPassword || !newPassword}
              activeOpacity={0.8}
              style={[
                styles.button,
                styles.inputSpacingTop,
                (isChangingPassword || !currentPassword || !newPassword) &&
                  styles.buttonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Change password"
            >
              {isChangingPassword ? (
                <ActivityIndicator size="small" color={colors.void} />
              ) : (
                <Text style={styles.buttonText}>{t('changePassword')}</Text>
              )}
            </TouchableOpacity>

            {/* Inline error — only rendered when present */}
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}
          </View>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Section 2 — Notifications                                     */}
          {/* ══════════════════════════════════════════════════════════════ */}

          <Text style={[styles.sectionTitle, styles.sectionSpacingTop]}>
            Notifications
          </Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('pushNotifications')}</Text>
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                trackColor={{ false: colors.border, true: colors.signal }}
                thumbColor={colors.paper}
                accessibilityRole="switch"
                accessibilityLabel="Push notifications"
                accessibilityState={{ checked: pushEnabled }}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Section 3 — Session                                           */}
          {/* ══════════════════════════════════════════════════════════════ */}

          <Text style={[styles.sectionTitle, styles.sectionSpacingTop]}>
            Session
          </Text>

          <View style={[styles.card, styles.adminCardSpacingBottom]}>
            <TouchableOpacity
              onPress={() => useAuthStore.getState().logout()}
              activeOpacity={0.8}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Text style={styles.rowLabel}>{t('logout')}</Text>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* Section 4 — Danger Zone                                       */}
          {/* ══════════════════════════════════════════════════════════════ */}

          <Text style={styles.sectionTitle}>
            {t('dangerZone')}
          </Text>

          <View style={styles.card}>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              activeOpacity={0.8}
              style={styles.dangerButton}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Text style={styles.dangerButtonText}>{t('deleteAccount')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.void,
  },
  flex: {
    flex: 1,
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    minWidth: 40,
    paddingVertical: spacing.xs,
  },
  backArrow: {
    fontSize: typography.sizes.xl,
    color: colors.paper,
    lineHeight: typography.sizes.xl + 4,
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    flex: 1,
    textAlign: 'center',
  },

  // ── Scroll content ──────────────────────────────────────────────────────────

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  // ── Section headers ─────────────────────────────────────────────────────────

  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  sectionSpacingTop: {
    marginTop: spacing.xxxl,
  },

  // ── Card container ──────────────────────────────────────────────────────────

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  subsectionTitle: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    marginBottom: spacing.md,
  },

  // ── Text inputs ─────────────────────────────────────────────────────────────

  input: {
    backgroundColor: colors.void,
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    height: 44,
  },
  inputSpacingTop: {
    marginTop: spacing.sm,
  },

  // ── Primary action button ────────────────────────────────────────────────────

  button: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.void,
  },

  // ── Inline password error ────────────────────────────────────────────────────

  errorText: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    // Danger red — matches '#FF3B30' intention; using the project token (#EF4444)
    color: '#FF3B30',
  },

  // ── Admin card spacing ────────────────────────────────────────────────────────

  // Adds margin below the admin card so the Account section title below it
  // has the same visual gap as the other sectionSpacingTop entries.
  adminCardSpacingBottom: {
    marginBottom: spacing.xxxl,
  },

  // ── Admin / Switch row ───────────────────────────────────────────────────────

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.paper,
  },
  adminIcon: {
    fontSize: typography.sizes.lg,
    marginRight: spacing.sm,
  },
  rowChevron: {
    fontSize: typography.sizes.lg,
    color: colors.muted,
    lineHeight: typography.sizes.lg + 4,
  },

  // ── Danger zone button ───────────────────────────────────────────────────────

  dangerButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  dangerButtonText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    // Explicit danger red per spec
    color: '#FF3B30',
  },
})

export default SettingsScreen
