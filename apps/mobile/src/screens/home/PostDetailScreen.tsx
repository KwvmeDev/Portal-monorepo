/**
 * PostDetailScreen — full expanded view of a single post.
 *
 * Layout:
 *   - Header: back button (left) + Share button (right)
 *   - Scrollable body: full post content (no line limits) + VoteControls
 *   - CommentThread: paginated live comment list
 *   - Fixed bottom reply bar: TextInput + Send button (auth-gated)
 *
 * Share uses expo-sharing with the deep-link format: portal://post/{postId}
 */
import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  SafeAreaView,
  Share,
  Image,
  Alert,
} from 'react-native'
import * as ExpoSharing from 'expo-sharing'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RichTextRenderer } from '../../components/ui/RichTextRenderer'
import type { StackScreenProps } from '@react-navigation/stack'
import { api } from '../../services/api'
import { CommentThread } from '../../components/feed/CommentThread'
import { useAuthStore } from '../../stores/authStore'
import { VoteControls } from '../../components/ui/VoteControls'
import { Avatar } from '../../components/ui/Avatar'
import { LinkPreviewCard } from '../../components/ui/LinkPreviewCard'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import { useTheme } from '../../theme/useTheme'
import type { PostWithDetails, CommentWithDetails } from '@portal/types'
import { useLanguage } from '../../i18n/LanguageContext'
import type { HomeStackParamList } from '../../navigation/AppNavigator'

// ─── Navigation prop ──────────────────────────────────────────────────────────

type Props = StackScreenProps<HomeStackParamList, 'PostDetail'>

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Formats a createdAt ISO string into a human-readable date+time string.
 * e.g. "Apr 5, 2026 · 3:42 PM"
 */
function formatFullTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const datePart = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart} · ${timePart}`
}

// ─── Post full content component ──────────────────────────────────────────────

interface PostFullContentProps {
  post: PostWithDetails
}

function PostFullContent({ post }: PostFullContentProps) {
  const { theme } = useTheme()

  return (
    <View style={styles.postContainer}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <Avatar
          uri={post.author.avatarUrl}
          name={post.author.displayName}
          size="md"
        />
        <View style={styles.authorMeta}>
          <Text style={[styles.displayName, { color: theme.textPrimary }]} numberOfLines={1}>
            {post.author.displayName}
          </Text>
          <Text style={[styles.handle, { color: theme.textMuted }]} numberOfLines={1}>
            @{post.author.username}
          </Text>
        </View>

        {/* Org badge when post is tied to an organisation */}
        {post.org && (
          <View style={[styles.orgBadge, { borderColor: theme.border }]}>
            <Text style={[styles.orgBadgeText, { color: colors.signal }]}>
              {post.org.name}
            </Text>
          </View>
        )}
      </View>

      {/* Full text content — no line limit on detail screen */}
      {post.content && post.contentType !== 'rich_text' && (
        <Text style={[styles.bodyText, { color: theme.textPrimary }]}>
          {post.content}
        </Text>
      )}

      {post.contentType === 'rich_text' && post.content && (
        <RichTextRenderer html={post.content} />
      )}

      {/* Image grid — render each image stacked for now */}
      {post.contentType === 'image' && post.mediaUrls.length > 0 && (
        <View style={styles.imageGrid}>
          {post.mediaUrls.map((url, idx) => (
            <Image
              key={url}
              source={{ uri: url }}
              style={styles.fullImage}
              resizeMode="cover"
              accessibilityLabel={`Post image ${idx + 1}`}
            />
          ))}
        </View>
      )}

      {/* Link preview */}
      {post.contentType === 'link' && post.linkPreview && (
        <View style={styles.linkWrapper}>
          <LinkPreviewCard preview={post.linkPreview} />
        </View>
      )}

      {/* Timestamp */}
      <Text style={[styles.timestamp, { color: theme.textMuted }]}>
        {formatFullTimestamp(post.createdAt)}
      </Text>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Vote controls */}
      <View style={styles.voteRow}>
        <VoteControls
          postId={post.id}
          initialUpvotes={post.upvotes}
          initialDownvotes={post.downvotes}
          initialUserVote={post.userVote}
        />

        {/* Comment count pill */}
        <View style={styles.statPill}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {post.commentCount}
          </Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>
            {post.commentCount === 1 ? 'comment' : 'comments'}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
    </View>
  )
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.centeredState}>
      <Text style={[styles.errorText, { color: theme.textMuted }]}>{message}</Text>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function PostDetailScreen({ route, navigation }: Props) {
  const { postId } = route.params
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  // ── Auth — reply bar is only rendered for authenticated users ─────────────
  const user = useAuthStore((s) => s.user)

  // ── Reply bar state ────────────────────────────────────────────────────────
  const [replyText, setReplyText] = useState('')
  // When set, the input submits as a reply (parentId) to this comment
  const [replyTo, setReplyTo] = useState<CommentWithDetails | null>(null)

  // ── Fetch the single post ──────────────────────────────────────────────────
  const {
    data: post,
    isLoading,
    isError,
    error,
  } = useQuery<PostWithDetails, Error>({
    queryKey: ['post', postId],
    queryFn: () => api.get<PostWithDetails>(`/posts/${postId}`),
    staleTime: 30_000,
  })

  const isOwnPost = post?.authorId === user?.id

  // ── Delete handler (own posts only) ────────────────────────────────────────
  const { mutate: deletePost, isPending: isDeleting } = useMutation({
    mutationFn: () => api.del(`/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      navigation.goBack()
    },
    onError: () => Alert.alert('Error', 'Could not delete post'),
  })

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Delete', style: 'destructive', onPress: () => deletePost() },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [deletePost])

  // ── Share handler ─────────────────────────────────────────────────────────
  // Attempts to use expo-sharing (native sheet); falls back to RN Share on
  // platforms where expo-sharing is unavailable.
  const handleShare = useCallback(async () => {
    const deepLink = `portal://post/${postId}`

    try {
      const available = await ExpoSharing.isAvailableAsync()
      if (available) {
        // expo-sharing requires a file URI on native; for URL sharing we fall
        // through to the native share sheet via RN's Share API which handles
        // plain text / URL sharing correctly on both iOS and Android.
        await Share.share({
          message: deepLink,
          url: deepLink,
          title: post ? `Post by ${post.author.displayName}` : 'Portal post',
        })
      } else {
        await Share.share({
          message: deepLink,
          title: post ? `Post by ${post.author.displayName}` : 'Portal post',
        })
      }
    } catch {
      // Silently ignore share cancellations — no error state needed
    }
  }, [postId, post])

  // ── Submit reply ───────────────────────────────────────────────────────────
  // POSTs to /api/posts/:postId/comments, then invalidates the comment list
  // so CommentThread automatically refetches the updated page.
  const { mutate: submitReply, isPending: isSubmitting } = useMutation<
    void,
    Error,
    { content: string; parentId?: string }
  >({
    mutationFn: ({ content, parentId }) =>
      api.post<void>(`/posts/${postId}/comments`, { content, ...(parentId ? { parentId } : {}) }),
    onSuccess: () => {
      setReplyText('')
      setReplyTo(null)
      // Refresh both the comment list and the post (updates commentCount)
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
    },
  })

  const handleSendReply = useCallback(() => {
    const trimmed = replyText.trim()
    if (trimmed.length === 0) return
    submitReply({ content: trimmed, parentId: replyTo?.id })
  }, [replyText, replyTo, submitReply])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {/* Back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.headerButtonText, { color: theme.textPrimary }]}>←</Text>
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Post</Text>

          {/* Right header actions */}
          <View style={styles.headerRight}>
            {isOwnPost && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel="Delete post"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={[styles.headerButtonText, { color: colors.danger }]}>
                    🗑
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleShare}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Share post"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.headerButtonText, { color: theme.textPrimary }]}>↗</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Scrollable body ── */}
        {isLoading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={colors.signal} size="large" />
          </View>
        ) : isError ? (
          <ErrorState
            message={(error as Error)?.message ?? 'Failed to load post'}
          />
        ) : post ? (
          // CommentThread's FlatList is the single scrollable root.
          // PostFullContent is passed as listHeaderComponent so the post
          // body and comments scroll together without nesting a FlatList
          // inside a ScrollView (which triggers the VirtualizedList warning).
          <CommentThread
            postId={postId}
            onReplyTo={setReplyTo}
            listHeaderComponent={<PostFullContent post={post} />}
          />
        ) : null}

        {/* ── Fixed reply bar — only shown to authenticated users ── */}
        {user !== null && (
          <View style={{ borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: theme.bg }}>
            {/* Replying-to chip — shown when the user tapped Reply on a comment */}
            {replyTo !== null && (
              <View style={[styles.replyChip, { backgroundColor: theme.surface }]}>
                <Text style={[styles.replyChipText, { color: colors.muted }]} numberOfLines={1}>
                  {t('replyingTo')}{' '}
                  <Text style={{ color: colors.signal }}>@{replyTo.author.username}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setReplyTo(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                >
                  <Text style={[styles.replyChipDismiss, { color: colors.muted }]}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.replyBar}>
            <TextInput
              value={replyText}
              onChangeText={setReplyText}
              placeholder={t('writeReply')}
              placeholderTextColor={colors.muted}
              style={[
                styles.replyInput,
                {
                  backgroundColor: theme.surface,
                  color: theme.textPrimary,
                  borderColor: theme.border,
                },
              ]}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={handleSendReply}
              editable={!isSubmitting}
              accessibilityLabel="Reply input"
            />
            <TouchableOpacity
              onPress={handleSendReply}
              disabled={replyText.trim().length === 0 || isSubmitting}
              style={[
                styles.sendButton,
                { opacity: replyText.trim().length === 0 || isSubmitting ? 0.35 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              accessibilityState={{ disabled: replyText.trim().length === 0 || isSubmitting }}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.regular,
  },
  headerTitle: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
  },

  // Post container
  postContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
  },
  handle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  orgBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  orgBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.semiBold,
  },

  // Body content
  bodyText: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  imageGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fullImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
  },
  linkWrapper: {
    marginBottom: spacing.md,
  },

  // Timestamp
  timestamp: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    marginBottom: spacing.md,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },

  // Vote row
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
  },
  statLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },

  // Loading / error states
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    textAlign: 'center',
  },

  // Replying-to chip shown above the input when replying to a specific comment
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  replyChipText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  replyChipDismiss: {
    fontSize: 20,
    lineHeight: 22,
    paddingLeft: spacing.sm,
  },
  // Reply bar — border-top is on the outer wrapper so chip sits inside it
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  replyInput: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
  },
  sendButton: {
    backgroundColor: colors.signal,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#000000',
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
})

export default PostDetailScreen
