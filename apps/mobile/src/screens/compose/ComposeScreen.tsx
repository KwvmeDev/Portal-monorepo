/**
 * ComposeScreen — full-screen modal for creating new posts.
 *
 * Supports four content modes: plain text, image, poll, and link.
 * Only one content mode (other than text) can be active at a time — selecting
 * a different mode clears the previous attachment.
 *
 * Flow:
 *   1. User enters text (always available) and optionally attaches content.
 *   2. "Post" button enables once there is any text OR an active attachment.
 *   3. On submit, POST /api/posts is called via useMutation.
 *   4. On success, the modal is dismissed and feed queries are invalidated so
 *      the new post surfaces at the top of the feed immediately.
 */
import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { StackScreenProps } from '@react-navigation/stack'
import type { AppStackParamList } from '../../navigation/AppNavigator'
import { RichTextEditor } from '../../components/ui/RichTextEditor'
import type { RichTextEditorHandle } from '../../components/ui/RichTextEditor'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/ui/Avatar'
import { LinkPreviewCard } from '../../components/ui/LinkPreviewCard'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import type { Post, LinkPreview, ContentType } from '@portal/types'

// ─── Server upload helper ─────────────────────────────────────────────────────

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

/**
 * Upload a local image URI to our server's media endpoint via multipart/form-data.
 * Returns the Cloudinary secure URL from the server response.
 * Throws with a descriptive message if the upload fails.
 */
async function uploadImageToServer(uri: string): Promise<string> {
  const token = useAuthStore.getState().accessToken
  const filename = uri.split('/').pop() ?? 'photo.jpg'
  const match = /\.(\w+)$/.exec(filename)
  const type = match ? `image/${match[1]}` : 'image/jpeg'

  const formData = new FormData()
  // React Native FormData accepts { uri, name, type } — cast to any since the
  // web FormData type definition does not include this shape.
  formData.append('file', { uri, name: filename, type } as any)

  const response = await fetch(`${BASE_URL}/api/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    body: formData,
  })

  const data = await response.json() as { url?: string; message?: string }
  if (!response.ok) throw new Error(data.message ?? 'Upload failed')
  if (!data.url) throw new Error('Server did not return a URL')
  return data.url
}

// ─── Navigation prop ─────────────────────────────────────────────────────────

type Props = StackScreenProps<AppStackParamList, 'ComposeModal'>

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of images that can be attached to a single post. */
const MAX_IMAGES = 4

/** Poll option count limits. */
const MIN_POLL_OPTIONS = 2
const MAX_POLL_OPTIONS = 4

/** Poll duration options shown in the picker. */
const POLL_DURATIONS: { label: string; days: number }[] = [
  { label: '1d', days: 1 },
  { label: '3d', days: 3 },
  { label: '7d', days: 7 },
]

/** Milliseconds to wait after the user stops typing a URL before previewing. */
const LINK_DEBOUNCE_MS = 500

// ─── Types ───────────────────────────────────────────────────────────────────

type ContentMode = 'text' | 'image' | 'poll' | 'link' | 'rich_text'

interface PollState {
  options: string[]
  durationDays: number
}

// ─── API payload type ─────────────────────────────────────────────────────────

interface CreatePostPayload {
  content?: string
  contentType: ContentType
  mediaUrls?: string[]
  linkUrl?: string
  linkPreview?: LinkPreview
  pollData?: {
    question: string
    options: { id: string; text: string; voteCount: number }[]
    endsAt: string
  }
}

// ─── Toolbar icon button ─────────────────────────────────────────────────────

interface ToolbarButtonProps {
  label: string
  active: boolean
  onPress: () => void
}

function ToolbarButton({ label, active, onPress }: ToolbarButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.toolbarButton, active && styles.toolbarButtonActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={[styles.toolbarLabel, active && styles.toolbarLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Image thumbnail strip ────────────────────────────────────────────────────

interface ImageStripProps {
  /** Local file URIs returned by expo-image-picker. */
  uris: string[]
  onRemove: (index: number) => void
}

/**
 * Horizontal strip of 72x72 image thumbnails.
 * Each thumbnail has an 18x18 circular × remove button in the top-right corner.
 * Returns null when no images are selected so it takes no space.
 */
function ImageStrip({ uris, onRemove }: ImageStripProps) {
  if (uris.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.imageStrip}
      contentContainerStyle={styles.imageStripContent}
    >
      {uris.map((uri, idx) => (
        <View key={uri} style={styles.thumbnailWrapper}>
          <Image
            source={{ uri }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityLabel={`Attached image ${idx + 1}`}
          />
          {/* × remove button — 18x18 circle in top-right corner */}
          <TouchableOpacity
            onPress={() => onRemove(idx)}
            style={styles.removeButton}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Remove image ${idx + 1}`}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Text style={styles.removeButtonText}>x</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )
}

// ─── Poll composer ────────────────────────────────────────────────────────────

interface PollComposerProps {
  poll: PollState
  onChange: (poll: PollState) => void
}

function PollComposer({ poll, onChange }: PollComposerProps) {
  const updateOption = (index: number, text: string) => {
    const updated = [...poll.options]
    updated[index] = text
    onChange({ ...poll, options: updated })
  }

  const addOption = () => {
    if (poll.options.length < MAX_POLL_OPTIONS) {
      onChange({ ...poll, options: [...poll.options, ''] })
    }
  }

  const removeOption = (index: number) => {
    if (poll.options.length > MIN_POLL_OPTIONS) {
      const updated = poll.options.filter((_, i) => i !== index)
      onChange({ ...poll, options: updated })
    }
  }

  return (
    <View style={styles.pollComposer}>
      {poll.options.map((option, idx) => (
        <View key={idx} style={styles.pollOptionRow}>
          <TextInput
            value={option}
            onChangeText={(t) => updateOption(idx, t)}
            placeholder={`Option ${idx + 1}`}
            placeholderTextColor={colors.muted}
            style={styles.pollOptionInput}
            maxLength={80}
            accessibilityLabel={`Poll option ${idx + 1}`}
          />
          {/* Only allow removal when above minimum option count */}
          {poll.options.length > MIN_POLL_OPTIONS && (
            <TouchableOpacity
              onPress={() => removeOption(idx)}
              style={styles.pollRemoveButton}
              accessibilityRole="button"
              accessibilityLabel={`Remove option ${idx + 1}`}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.pollRemoveText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {poll.options.length < MAX_POLL_OPTIONS && (
        <TouchableOpacity
          onPress={addOption}
          style={styles.addOptionButton}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.addOptionText}>+ Add option</Text>
        </TouchableOpacity>
      )}

      {/* Duration picker */}
      <View style={styles.durationRow}>
        <Text style={styles.durationLabel}>Duration:</Text>
        {POLL_DURATIONS.map((d) => (
          <TouchableOpacity
            key={d.days}
            onPress={() => onChange({ ...poll, durationDays: d.days })}
            style={[
              styles.durationChip,
              poll.durationDays === d.days && styles.durationChipActive,
            ]}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected: poll.durationDays === d.days }}
          >
            <Text
              style={[
                styles.durationChipText,
                poll.durationDays === d.days && styles.durationChipTextActive,
              ]}
            >
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// ─── Link previewer ───────────────────────────────────────────────────────────

interface LinkComposerProps {
  linkUrl: string
  onUrlChange: (url: string) => void
  preview: LinkPreview | null
  loadingPreview: boolean
}

function LinkComposer({ linkUrl, onUrlChange, preview, loadingPreview }: LinkComposerProps) {
  return (
    <View style={styles.linkComposer}>
      <TextInput
        value={linkUrl}
        onChangeText={onUrlChange}
        placeholder="Paste a URL…"
        placeholderTextColor={colors.muted}
        style={styles.linkInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="URL input"
      />
      {loadingPreview && (
        <ActivityIndicator
          color={colors.signal}
          size="small"
          style={styles.linkLoader}
        />
      )}
      {preview && !loadingPreview && (
        <View style={styles.linkPreviewWrapper}>
          <LinkPreviewCard preview={preview} />
        </View>
      )}
    </View>
  )
}

// ─── Main ComposeScreen ───────────────────────────────────────────────────────

export function ComposeScreen({ navigation }: Props) {
  const { top } = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  // ── Core text content ──────────────────────────────────────────────────────
  const [bodyText, setBodyText] = useState('')

  // ── Active content mode ────────────────────────────────────────────────────
  const [mode, setMode] = useState<ContentMode>('text')

  // ── Image attachment state ─────────────────────────────────────────────────
  // Local URIs selected by the user. Uploads happen sequentially at submit time.
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  // True while images are being uploaded during post submit
  const [isUploadingImages, setIsUploadingImages] = useState(false)

  // ── Poll attachment state ──────────────────────────────────────────────────
  const [poll, setPoll] = useState<PollState>({
    options: ['', ''],
    durationDays: 1,
  })

  // ── Rich text editor ref + content tracking ────────────────────────────────
  const richEditorRef = useRef<RichTextEditorHandle>(null)
  const [richTextContent, setRichTextContent] = useState('')

  // ── Link attachment state ──────────────────────────────────────────────────
  const [linkUrl, setLinkUrl] = useState('')
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const linkDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Derived: can the Post button be enabled? ────────────────────────────
  const hasText = bodyText.trim().length > 0
  const hasImages = selectedImages.length > 0
  const hasValidPoll =
    mode === 'poll' &&
    poll.options.filter((o) => o.trim().length > 0).length >= MIN_POLL_OPTIONS
  const hasLink = mode === 'link' && linkUrl.trim().length > 0
  const hasRichText = mode === 'rich_text' && richTextContent.replace(/<[^>]*>/g, '').trim().length > 0
  const canPost = hasText || hasImages || hasValidPoll || hasLink || hasRichText
  // Block Post while images are uploading at submit time
  const postEnabled = canPost && !isUploadingImages

  // ─── Switch content mode ─────────────────────────────────────────────────
  const switchMode = useCallback((next: ContentMode) => {
    // Toggle off if already active
    if (mode === next) {
      setMode('text')
      return
    }
    // Clear state of old mode before switching
    if (mode === 'image') setSelectedImages([])
    if (mode === 'poll') setPoll({ options: ['', ''], durationDays: 1 })
    if (mode === 'link') {
      setLinkUrl('')
      setLinkPreview(null)
    }
    if (mode === 'rich_text') {
      setRichTextContent('')
    }

    setMode(next)
  }, [mode])

  // ─── Image picker ─────────────────────────────────────────────────────────
  // Opens the system image library. Selected URIs are stored locally.
  // Actual uploads happen sequentially when the user taps Post, so the picker
  // stays fast and the user can deselect images before committing.
  const handlePickImages = useCallback(async () => {
    if (selectedImages.length >= MAX_IMAGES) return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - selectedImages.length,
    })

    if (!result.canceled) {
      setSelectedImages((prev) =>
        [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES),
      )
    }
  }, [selectedImages])

  const handleRemoveImage = useCallback((index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ─── Link URL change with debounced preview fetch ─────────────────────────
  const handleLinkUrlChange = useCallback((url: string) => {
    setLinkUrl(url)
    setLinkPreview(null)

    if (linkDebounceTimer.current) {
      clearTimeout(linkDebounceTimer.current)
    }

    if (!url.trim()) {
      setLoadingPreview(false)
      return
    }

    setLoadingPreview(true)
    linkDebounceTimer.current = setTimeout(async () => {
      try {
        const preview = await api.post<LinkPreview>('/posts/preview-link', { url })
        setLinkPreview(preview)
      } catch {
        setLinkPreview(null)
      } finally {
        setLoadingPreview(false)
      }
    }, LINK_DEBOUNCE_MS)
  }, [])

  // ─── Post mutation ────────────────────────────────────────────────────────
  const { mutate: submitPost, isPending: isSubmitting } = useMutation<Post, Error, CreatePostPayload>({
    mutationFn: (payload) => api.post<Post>('/posts', payload),
    onSuccess: () => {
      // Invalidate all three feed query caches so the new post appears at top
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      navigation.goBack()
    },
    // Error is surfaced via Alert for now; Sprint 8 will wire in a toast system
    onError: (err) => {
      console.warn('[ComposeScreen] Post failed:', err.message)
    },
  })

  const handlePost = useCallback(async () => {
    if (!postEnabled || isSubmitting || isUploadingImages) return

    // Upload selected images sequentially before submitting the post.
    // Sequential (not concurrent) to avoid overwhelming the server and to
    // give clear per-image failure attribution in the error alert.
    let mediaUrls: string[] | undefined
    if (selectedImages.length > 0) {
      setIsUploadingImages(true)
      try {
        const urls: string[] = []
        for (const uri of selectedImages) {
          const url = await uploadImageToServer(uri)
          urls.push(url)
        }
        mediaUrls = urls
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        Alert.alert('Upload failed', `Could not upload image. ${message}`)
        setIsUploadingImages(false)
        return
      } finally {
        setIsUploadingImages(false)
      }
    }

    // Build the payload based on the current mode
    const payload: CreatePostPayload = {
      content: bodyText.trim() || undefined,
      contentType: 'text',
    }

    if (mediaUrls && mediaUrls.length > 0) {
      payload.mediaUrls = mediaUrls
      // Treat posts with images as image content type when not in another mode
      if (mode === 'text' || mode === 'image') {
        payload.contentType = 'image'
      }
    }

    if (mode === 'poll' && hasValidPoll) {
      payload.contentType = 'poll'
      const endsAt = new Date(
        Date.now() + poll.durationDays * 24 * 60 * 60 * 1000,
      ).toISOString()
      const validOptions = poll.options.filter((o) => o.trim().length > 0)
      payload.pollData = {
        question: bodyText.trim() || 'Poll',
        options: validOptions.map((text, i) => ({
          id: String(i + 1),
          text,
          voteCount: 0,
        })),
        endsAt,
      }
    } else if (mode === 'link' && hasLink) {
      payload.contentType = 'link'
      payload.linkUrl = linkUrl.trim()
      if (linkPreview) {
        payload.linkPreview = linkPreview
      }
    } else if (mode === 'rich_text' && hasRichText) {
      payload.contentType = 'rich_text'
      payload.content = await richEditorRef.current!.getHTML()
    }

    submitPost(payload)
  }, [
    postEnabled,
    isSubmitting,
    isUploadingImages,
    selectedImages,
    bodyText,
    mode,
    hasImages,
    hasValidPoll,
    poll,
    hasLink,
    linkUrl,
    linkPreview,
    hasRichText,
    submitPost,
  ])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          {/* Post button — disabled and shows spinner while images are
              uploading at submit time or while the post mutation is in-flight */}
          <TouchableOpacity
            onPress={handlePost}
            disabled={!postEnabled || isSubmitting || isUploadingImages}
            style={[
              styles.postButton,
              (!postEnabled || isSubmitting || isUploadingImages) && styles.postButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Post"
            accessibilityState={{ disabled: !postEnabled || isSubmitting || isUploadingImages }}
          >
            {isSubmitting || isUploadingImages ? (
              <ActivityIndicator color={colors.void} size="small" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Scrollable compose area ── */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            <Avatar
              uri={user?.avatarUrl}
              name={user?.displayName}
              size="md"
            />
            <Text style={styles.displayName} numberOfLines={1}>
              {user?.displayName ?? user?.username ?? ''}
            </Text>
          </View>

          {/* Image preview strip — always visible above the text input when
              images are selected, regardless of content mode */}
          <ImageStrip uris={selectedImages} onRemove={handleRemoveImage} />

          {/* Primary text input — hidden in rich_text mode (editor takes over) */}
          {mode !== 'rich_text' && (
            <TextInput
              value={bodyText}
              onChangeText={setBodyText}
              placeholder="What's happening?"
              placeholderTextColor={colors.muted}
              style={styles.mainInput}
              multiline
              textAlignVertical="top"
              autoFocus
              scrollEnabled={false}
              maxLength={2000}
              accessibilityLabel="Post content"
            />
          )}

          {/* ── Mode-specific attachments ── */}
          {mode === 'image' && selectedImages.length === 0 && (
            <View style={styles.attachment}>
              <TouchableOpacity
                onPress={handlePickImages}
                style={styles.addImageButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add images"
              >
                <Text style={styles.addImageText}>
                  Add photos ({selectedImages.length}/{MAX_IMAGES})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'poll' && (
            <View style={styles.attachment}>
              <PollComposer poll={poll} onChange={setPoll} />
            </View>
          )}

          {mode === 'link' && (
            <View style={styles.attachment}>
              <LinkComposer
                linkUrl={linkUrl}
                onUrlChange={handleLinkUrlChange}
                preview={linkPreview}
                loadingPreview={loadingPreview}
              />
            </View>
          )}

          {mode === 'rich_text' && (
            <RichTextEditor
              ref={richEditorRef}
              placeholder="Write your article…"
              onChange={setRichTextContent}
              height={320}
            />
          )}

        </ScrollView>

        {/* ── Content type toolbar ── */}
        <View style={styles.toolbar}>
          {/* Camera-roll button — hidden once MAX_IMAGES are selected.
              Works from any content mode so users can always attach images. */}
          {selectedImages.length < MAX_IMAGES && (
            <ToolbarButton
              label="📷"
              active={mode === 'image'}
              onPress={handlePickImages}
            />
          )}
          <ToolbarButton
            label="📊"
            active={mode === 'poll'}
            onPress={() => switchMode('poll')}
          />
          <ToolbarButton
            label="🔗"
            active={mode === 'link'}
            onPress={() => switchMode('link')}
          />
          <ToolbarButton
            label="A"
            active={mode === 'rich_text'}
            onPress={() => switchMode('rich_text')}
          />

          {mode !== 'rich_text' && (
            <View style={styles.charCountWrapper}>
              <Text style={[styles.charCount, bodyText.length > 1800 && styles.charCountWarning]}>
                {bodyText.length > 0 ? `${bodyText.length}/2000` : ''}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.void,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  cancelText: {
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  postButton: {
    backgroundColor: colors.signal,   // #4CD964
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postButtonDisabled: {
    opacity: 0.35,
  },
  postButtonText: {
    color: '#000000',   // Black text on green per spec
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },

  // Scroll area
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  displayName: {
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    flex: 1,
  },

  // Main text input
  mainInput: {
    color: colors.paper,
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: 0,
  },

  // Attachment container
  attachment: {
    marginTop: spacing.md,
  },

  // Image strip — horizontal scrollable row of thumbnails
  imageStrip: {
    marginBottom: spacing.sm,
  },
  imageStripContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  thumbnailWrapper: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    // colors.void (#010101) background per design spec
    backgroundColor: colors.void,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: colors.paper,
    fontSize: 9,
    lineHeight: 11,
  },
  addImageButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addImageText: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },

  // Poll composer
  pollComposer: {
    gap: spacing.sm,
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pollOptionInput: {
    flex: 1,
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
  pollRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollRemoveText: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
  },
  addOptionButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  addOptionText: {
    color: colors.signal,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  durationLabel: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  durationChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  durationChipActive: {
    borderColor: colors.signal,
    backgroundColor: `${colors.signal}1A`,   // 10% opacity tint
  },
  durationChipText: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  durationChipTextActive: {
    color: colors.signal,
  },

  // Link composer
  linkComposer: {
    gap: spacing.sm,
  },
  linkInput: {
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
  linkLoader: {
    alignSelf: 'flex-start',
    marginLeft: spacing.xs,
  },
  linkPreviewWrapper: {
    marginTop: spacing.xs,
  },

  // Bottom toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.void,
    gap: spacing.xs,
  },
  toolbarButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: `${colors.signal}1A`,
  },
  toolbarLabel: {
    fontSize: typography.sizes.lg,
    color: colors.muted,
  },
  toolbarLabelActive: {
    color: colors.signal,
  },
  charCountWrapper: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: spacing.sm,
  },
  charCount: {
    color: colors.muted,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
  },
  charCountWarning: {
    color: colors.warning,
  },
})

export default ComposeScreen
