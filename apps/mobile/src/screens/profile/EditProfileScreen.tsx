/**
 * EditProfileScreen — allows authenticated users to update their display name,
 * bio, and avatar.
 *
 * Avatar upload flow:
 *   1. User taps the avatar → ImagePicker opens (single image, quality 0.8).
 *   2. Local URI is shown immediately as a live preview.
 *   3. Image is uploaded to POST /api/media/upload via raw fetch + FormData
 *      (same multipart pattern as uploadService; api service sends JSON only).
 *   4. avatarUrl state is swapped to the returned Cloudinary URL once upload completes.
 *
 * Save flow:
 *   PATCH /api/users/me with only changed fields → hydrate() → goBack().
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useMutation } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/ui/Avatar'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLanguage } from '../../i18n/LanguageContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISPLAY_NAME_MAX = 50
const BIO_MAX = 300

// Must stay in sync with the key in api.ts / authStore.ts
const ACCESS_TOKEN_KEY = '@portal/accessToken'

// Base URL for the multipart upload request — matches api.ts
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MediaUploadResponse {
  url: string
  secureUrl?: string
  publicId?: string
}

interface UpdateUserPayload {
  displayName?: string
  bio?: string
  avatarUrl?: string
}

// ---------------------------------------------------------------------------
// EditProfileScreen
// ---------------------------------------------------------------------------

export function EditProfileScreen() {
  const navigation = useNavigation()
  const currentUser = useAuthStore((s) => s.user)
  const { t } = useLanguage()

  // Pre-fill form fields from the current user in the auth store
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '')
  const [bio, setBio] = useState(currentUser?.bio ?? '')

  // avatarUrl tracks the final uploaded URL (or the original if untouched).
  // avatarPreviewUri is the local URI shown as a live preview while upload is in-flight.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(currentUser?.avatarUrl ?? null)
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  // ---------------------------------------------------------------------------
  // Avatar pick + upload
  // ---------------------------------------------------------------------------

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    })

    if (result.canceled || result.assets.length === 0) return

    const asset = result.assets[0]

    // Show local URI immediately as a live preview before upload completes
    setAvatarPreviewUri(asset.uri)
    setIsUploadingAvatar(true)

    try {
      const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY)

      // Build multipart FormData — same pattern used in uploadService.ts
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob)

      const response = await fetch(`${BASE_URL}/api/media/upload`, {
        method: 'POST',
        headers: {
          // No Content-Type header — fetch sets multipart boundary automatically
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`)
      }

      const json = await response.json()
      const uploaded: MediaUploadResponse = json.data ?? json

      // Prefer secureUrl (Cloudinary), fall back to url
      const uploadedUrl = uploaded.secureUrl ?? uploaded.url
      setAvatarUrl(uploadedUrl)
    } catch (err) {
      // Revert preview on failure and alert the user
      setAvatarPreviewUri(null)
      Alert.alert('Upload failed', 'Could not upload avatar. Please try again.')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Save mutation — PATCH /api/users/me with only changed fields
  // ---------------------------------------------------------------------------

  const { mutate: saveProfile, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const payload: UpdateUserPayload = {}

      if (displayName !== (currentUser?.displayName ?? '')) {
        payload.displayName = displayName
      }
      if (bio !== (currentUser?.bio ?? '')) {
        payload.bio = bio
      }
      if (avatarUrl !== (currentUser?.avatarUrl ?? null)) {
        payload.avatarUrl = avatarUrl ?? undefined
      }

      return api.patch('/users/me', payload)
    },
    onSuccess: async () => {
      // Refresh local auth state so changes are reflected everywhere immediately
      await useAuthStore.getState().hydrate()
      navigation.goBack()
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not save profile.'
      Alert.alert('Save failed', message)
    },
  })

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // The image shown in the avatar section:
  //   - avatarPreviewUri while the upload is in-flight (local URI for speed)
  //   - avatarUrl once upload finishes (Cloudinary URL) or when untouched
  const displayAvatarUri = avatarPreviewUri ?? avatarUrl

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header row: Cancel | title | Save ── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerSideButton}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>{t('editProfile')}</Text>

          <TouchableOpacity
            onPress={() => saveProfile()}
            disabled={isSaving || isUploadingAvatar}
            style={[styles.headerSideButton, styles.headerSideButtonRight]}
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: isSaving || isUploadingAvatar }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.signal} />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  isUploadingAvatar && styles.saveTextDisabled,
                ]}
              >
                {t('save')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Avatar section ── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={handlePickAvatar}
              disabled={isUploadingAvatar}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              style={styles.avatarWrapper}
            >
              {displayAvatarUri ? (
                <Image
                  source={{ uri: displayAvatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  accessibilityLabel="Profile photo preview"
                />
              ) : (
                // Initials fallback when no avatar is set
                <Avatar
                  uri={null}
                  name={displayName || currentUser?.displayName}
                  size="xl"
                />
              )}

              {/* Upload-in-progress overlay */}
              {isUploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={colors.paper} />
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.changePhotoLabel}>{t('changePhoto')}</Text>
          </View>

          {/* ── Display name field ── */}
          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>{t('nameLabel')}</Text>
              <Text style={styles.charCount}>
                {displayName.length}/{DISPLAY_NAME_MAX}
              </Text>
            </View>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={DISPLAY_NAME_MAX}
              placeholder="Your display name"
              placeholderTextColor={colors.muted}
              style={styles.textInput}
              autoCapitalize="words"
              accessibilityLabel="Display name"
            />
          </View>

          {/* ── Bio field ── */}
          <View style={styles.fieldBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>{t('bioLabel')}</Text>
              <Text style={styles.charCount}>
                {bio.length}/{BIO_MAX}
              </Text>
            </View>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              placeholder="Tell people a little about yourself"
              placeholderTextColor={colors.muted}
              style={[styles.textInput, styles.bioInput]}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Bio"
            />
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

  // ── Header row ──────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerSideButton: {
    minWidth: 60,
    paddingVertical: spacing.xs,
  },
  headerSideButtonRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    flex: 1,
    textAlign: 'center',
  },
  cancelText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.paper,
  },
  saveText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.signal,
  },
  saveTextDisabled: {
    opacity: 0.5,
  },

  // ── Scroll area ─────────────────────────────────────────────────────────────

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },

  // ── Avatar section ──────────────────────────────────────────────────────────

  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  avatarWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  // Translucent overlay shown while the avatar upload is in-flight
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 40,
  },
  changePhotoLabel: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.signal,
  },

  // ── Form fields ─────────────────────────────────────────────────────────────

  fieldBlock: {
    marginBottom: spacing.xl,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  charCount: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },
  textInput: {
    backgroundColor: colors.surface,
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
  bioInput: {
    height: 100,
    paddingTop: spacing.sm,
  },
})

export default EditProfileScreen
