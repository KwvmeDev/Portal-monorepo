import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Share,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import { Avatar } from './Avatar'
import { ImageGrid } from './ImageGrid'
import { LinkPreviewCard } from './LinkPreviewCard'
import { PollCard } from './PollCard'
import { api, type ApiError } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import type { PostWithDetails, RepostOrigin } from '@portal/types'
import { VoteControls } from './VoteControls'
import { FollowButton } from './FollowButton'
import { RichTextRenderer } from './RichTextRenderer'
import { MessageSquare, Repeat2, Share2, MoreHorizontal } from 'lucide-react-native'

// --- Pure helpers ---

/**
 * Formats a createdAt ISO string into a compact relative label.
 * e.g. "3h", "2d", "Apr 5"
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return 'now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/**
 * Strips HTML tags and decodes common entities from a rich_text string,
 * returning plain readable text safe to pass to a React Native Text node.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// --- Sub-components ---

// ---------------------------------------------------------------------------
// Report reasons matching the server-side ReportReason enum
// ---------------------------------------------------------------------------

type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'explicit_content' | 'other'

const REPORT_REASON_LABELS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'explicit_content', label: 'Explicit Content' },
  { value: 'other', label: 'Other' },
]

// ---------------------------------------------------------------------------
// ReportButton — three-dot menu for reporting a post
// ---------------------------------------------------------------------------

interface ReportButtonProps {
  targetId: string
  targetType: 'post' | 'comment'
}

/**
 * Renders a three-dot (⋯) button that opens a two-step Alert flow:
 * 1. Options sheet: "Report Post/Comment" or "Cancel"
 * 2. Reason picker: human-readable ReportReason options
 *
 * Uses useMutation for the POST /api/reports call.
 * 409 (already reported) is silently ignored.
 */
function ReportButton({ targetId, targetType }: ReportButtonProps) {
  const { theme } = useTheme()
  const entityLabel = targetType === 'post' ? 'Post' : 'Comment'

  const { mutate: submitReport, isPending } = useMutation<void, ApiError, ReportReason>({
    mutationFn: (reason) =>
      api.post<void>('/reports', { targetId, targetType, reason }),
    onSuccess: () => {
      Alert.alert('Reported', 'Thank you for your report')
    },
    onError: (error) => {
      // 409 means the user already reported this content — ignore silently
      if (error.statusCode === 409) return
      Alert.alert('Error', 'Could not submit report')
    },
  })

  const showReasonPicker = useCallback(() => {
    Alert.alert(
      `Report ${entityLabel}`,
      'Select a reason:',
      [
        ...REPORT_REASON_LABELS.map(({ value, label }) => ({
          text: label,
          onPress: () => submitReport(value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    )
  }, [entityLabel, submitReport])

  const handlePress = useCallback(() => {
    Alert.alert('', '', [
      { text: `Report ${entityLabel}`, onPress: showReasonPicker },
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }, [entityLabel, showReasonPicker])

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.reportButton}
      accessibilityRole="button"
      accessibilityLabel={`Report ${entityLabel}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={theme.textMuted} />
      ) : (
        <MoreHorizontal color={theme.textMuted} size={18} />
      )}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// OwnPostMenu — three-dot menu shown on the author's own posts (delete action)
// ---------------------------------------------------------------------------

interface OwnPostMenuProps {
  postId: string
}

function OwnPostMenu({ postId }: OwnPostMenuProps) {
  const { theme } = useTheme()
  const queryClient = useQueryClient()

  const { mutate: deletePost, isPending } = useMutation({
    mutationFn: () => api.del(`/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
    },
    onError: () => Alert.alert('Error', 'Could not delete post'),
  })

  const handlePress = useCallback(() => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Delete', style: 'destructive', onPress: () => deletePost() },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [deletePost])

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.reportButton}
      accessibilityRole="button"
      accessibilityLabel="Delete post"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={theme.textMuted} />
      ) : (
        <MoreHorizontal color={theme.textMuted} size={18} />
      )}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// AuthorRow
// ---------------------------------------------------------------------------

interface AuthorRowProps {
  post: PostWithDetails
  onAuthorPress: () => void
  onOrgPress: () => void
  isOwnPost: boolean
  viewerFollowsAuthor: boolean
}

function AuthorRow({ post, onAuthorPress, onOrgPress, isOwnPost, viewerFollowsAuthor }: AuthorRowProps) {
  const { theme } = useTheme()

  return (
    <View style={styles.authorRow}>
      <TouchableOpacity onPress={onAuthorPress} activeOpacity={0.8}>
        <Avatar
          uri={post.author.avatarUrl}
          name={post.author.displayName}
          size="sm"
        />
      </TouchableOpacity>

      <View style={styles.authorMeta}>
        <View style={styles.authorNameRow}>
          <TouchableOpacity onPress={onAuthorPress} activeOpacity={0.8}>
            <Text
              style={[styles.displayName, { color: theme.textPrimary }]}
              numberOfLines={1}
            >
              {post.author.displayName}
            </Text>
          </TouchableOpacity>

          {post.org && (
            <TouchableOpacity
              onPress={onOrgPress}
              activeOpacity={0.8}
              style={[styles.orgBadge, { borderColor: theme.border }]}
            >
              <Text style={[styles.orgBadgeText, { color: colors.signal }]}>
                {post.org.name}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text
          style={[styles.handleTimestamp, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          @{post.author.username} · {formatTimestamp(post.createdAt)}
        </Text>
      </View>

      {/* Follow button — hidden for own posts and for already-followed authors */}
      {!isOwnPost && !viewerFollowsAuthor && (
        <FollowButton userId={post.author.id} initialIsFollowing={false} />
      )}

      {/* Three-dot menu: delete for own posts, report for others */}
      {isOwnPost ? (
        <OwnPostMenu postId={post.id} />
      ) : (
        <ReportButton targetId={post.id} targetType="post" />
      )}
    </View>
  )
}

interface TextContentProps {
  content: string
}

function TextContent({ content }: TextContentProps) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  // Heuristic: lines > 3 get a "Show more" toggle.
  // We use numberOfLines on the Text component; onTextLayout tracks overflow.
  const [isTruncated, setIsTruncated] = useState(false)

  return (
    <View>
      <Text
        style={[styles.textContent, { color: theme.textPrimary }]}
        numberOfLines={expanded ? undefined : 3}
        onTextLayout={(e) => {
          if (!expanded) {
            setIsTruncated(e.nativeEvent.lines.length >= 3)
          }
        }}
      >
        {content}
      </Text>

      {!expanded && isTruncated && (
        <TouchableOpacity onPress={() => setExpanded(true)} activeOpacity={0.7}>
          <Text style={[styles.showMore, { color: colors.signal }]}>
            Show more
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}


interface RepostIndicatorProps {
  type: 'repost' | 'quote'
  label: string
}

function RepostIndicator({ type, label }: RepostIndicatorProps) {
  const { theme } = useTheme()
  const icon = type === 'repost' ? '↺' : '"'

  return (
    <View style={styles.repostIndicator}>
      <Text style={[styles.repostIcon, { color: theme.textMuted }]}>{icon}</Text>
      <Text style={[styles.repostLabel, { color: theme.textMuted }]}>
        {label}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// RepostBanner — "@username reposted" label shown at the top of repost cards
// ---------------------------------------------------------------------------

interface RepostBannerProps {
  reposterUsername: string
}

/**
 * Small attribution row rendered above an embedded repost card.
 * Shows a Repeat2 icon and "@{username} reposted" in muted colours so
 * it is visually secondary to the original post content below.
 */
function RepostBanner({ reposterUsername }: RepostBannerProps) {
  const { theme } = useTheme()

  return (
    <View style={styles.repostBanner}>
      <Repeat2 color={theme.textMuted} size={16} strokeWidth={1.75} />
      <Text style={[styles.repostBannerText, { color: theme.textMuted }]}>
        @{reposterUsername} reposted
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// EmbeddedPostCard — compact bordered inset card showing the original post
// ---------------------------------------------------------------------------

interface EmbeddedPostCardProps {
  origin: RepostOrigin
}

/**
 * Renders a compact, bordered inset card for the original post referenced by
 * a repost. Intentionally omits vote controls, action row, and report button —
 * only the author identity, timestamp, text content, and media are shown.
 */
function EmbeddedPostCard({ origin }: EmbeddedPostCardProps) {
  const { theme } = useTheme()

  const displayContent =
    origin.contentType === 'rich_text' && origin.content
      ? stripHtml(origin.content)
      : origin.content ?? null

  return (
    <View
      style={[
        styles.embeddedCard,
        { borderColor: theme.border, backgroundColor: theme.bg },
      ]}
    >
      {/* Original author row: avatar + displayName + @username · timestamp */}
      <View style={styles.embeddedAuthorRow}>
        <Avatar
          uri={origin.author.avatarUrl}
          name={origin.author.displayName}
          size="sm"
        />
        <View style={styles.embeddedAuthorMeta}>
          <Text
            style={[styles.embeddedDisplayName, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {origin.author.displayName}
          </Text>
          <Text
            style={[styles.embeddedHandleTimestamp, { color: theme.textMuted }]}
            numberOfLines={1}
          >
            @{origin.author.username} · {formatTimestamp(origin.createdAt)}
          </Text>
        </View>
      </View>

      {/* Original post content */}
      {displayContent ? (
        <Text
          style={[styles.embeddedContent, { color: theme.textPrimary }]}
          numberOfLines={6}
        >
          {displayContent}
        </Text>
      ) : null}

      {/* Original post media (images) */}
      {origin.mediaUrls && origin.mediaUrls.length > 0 && (
        <View style={styles.embeddedImageWrapper}>
          <ImageGrid urls={origin.mediaUrls} />
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// EmbeddedPostUnavailable — fallback when post.repostOf is null/undefined
// ---------------------------------------------------------------------------

function EmbeddedPostUnavailable() {
  const { theme } = useTheme()

  return (
    <View style={[styles.embeddedCard, { borderColor: theme.border }]}>
      <Text style={[styles.embeddedContent, { color: theme.textMuted }]}>
        Post unavailable
      </Text>
    </View>
  )
}

interface ActionRowProps {
  post: PostWithDetails
  onCommentPress: () => void
  onSharePress: () => void
}

function ActionRow({ post, onCommentPress, onSharePress }: ActionRowProps) {
  const { theme } = useTheme()
  const [repostCount, setRepostCount] = useState(post.repostCount)
  const [isReposted, setIsReposted] = useState(false)

  const { mutate: repost } = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/repost`, {}),
    onMutate: () => {
      setIsReposted(true)
      setRepostCount((c) => c + 1)
    },
    onError: () => {
      setIsReposted(false)
      setRepostCount((c) => c - 1)
    },
  })

  const handleRepostPress = () => {
    if (!isReposted) repost()
  }

  return (
    <View style={styles.actionRow}>
      <VoteControls
        postId={post.id}
        initialUpvotes={post.upvotes}
        initialDownvotes={post.downvotes}
        initialUserVote={post.userVote}
      />

      {/* Comment */}
      <TouchableOpacity onPress={onCommentPress} activeOpacity={0.7} style={styles.actionButton}>
        <MessageSquare color={theme.textMuted} size={18} strokeWidth={1.75} />
        {post.commentCount > 0 && (
          <Text style={[styles.actionCount, { color: theme.textMuted }]}>
            {formatCount(post.commentCount)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Repost */}
      <TouchableOpacity onPress={handleRepostPress} activeOpacity={0.7} style={styles.actionButton}>
        <Repeat2 color={isReposted ? colors.signal : theme.textMuted} size={18} strokeWidth={1.75} />
        {repostCount > 0 && (
          <Text style={[styles.actionCount, { color: isReposted ? colors.signal : theme.textMuted }]}>
            {formatCount(repostCount)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Share */}
      <TouchableOpacity onPress={onSharePress} activeOpacity={0.7} style={styles.actionButton}>
        <Share2 color={theme.textMuted} size={18} strokeWidth={1.75} />
      </TouchableOpacity>
    </View>
  )
}

// --- Navigation prop shape (keep PostCard decoupled from react-navigation) ---

interface PostCardNavigation {
  navigateToPostDetail: (postId: string) => void
  navigateToUserProfile: (userId: string) => void
  navigateToOrgProfile: (orgId: string) => void
}

interface PostCardProps {
  post: PostWithDetails
  /** The optionId the current viewer has voted for on the embedded poll, if any. */
  pollUserVote?: string | null
  /** Called when the user casts a poll vote. */
  onPollVote?: (optionId: string) => void
  navigation: PostCardNavigation
}

// --- Main component ---

export function PostCard({ post, pollUserVote, onPollVote, navigation }: PostCardProps) {
  const { theme } = useTheme()
  // Obtain the current user to determine ownership — if viewer is author, hide report button
  const currentUser = useAuthStore((state) => state.user)

  const handleCardPress = () => navigation.navigateToPostDetail(post.id)
  const handleAuthorPress = () => navigation.navigateToUserProfile(post.author.id)
  const handleOrgPress = () => {
    if (post.org) navigation.navigateToOrgProfile(post.org.id)
  }
  const handleCommentPress = () => navigation.navigateToPostDetail(post.id)
  const handleSharePress = async () => {
    await Share.share({
      message: `portal://post/${post.id}`,
      url: `portal://post/${post.id}`,
    })
  }

  const isRepost = post.contentType === 'repost'

  return (
    <TouchableOpacity
      onPress={handleCardPress}
      activeOpacity={0.95}
      style={[styles.card, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}
    >
      {/* Repost attribution banner — "@username reposted", shown only for repost cards */}
      {isRepost && (
        <RepostBanner reposterUsername={post.author.username} />
      )}

      {/* Author row — hidden for repost cards (original post's author is shown inside EmbeddedPostCard) */}
      {!isRepost && (
        <AuthorRow
          post={post}
          onAuthorPress={handleAuthorPress}
          onOrgPress={handleOrgPress}
          isOwnPost={post.authorId === currentUser?.id}
          viewerFollowsAuthor={post.viewerFollowsAuthor}
        />
      )}

      {isRepost ? (
        /* Repost body: show embedded original post card only */
        <View style={styles.contentArea}>
          {post.repostOf ? (
            <EmbeddedPostCard origin={post.repostOf} />
          ) : (
            <EmbeddedPostUnavailable />
          )}
        </View>
      ) : (
        /* Normal post body: conditional by contentType */
        <>
          <View style={styles.contentArea}>
            {/* Text is shown for text, link, and quote posts */}
            {post.content && post.contentType !== 'rich_text' && (
              <TextContent content={post.content} />
            )}

            {post.contentType === 'rich_text' && post.content && (
              <RichTextRenderer html={post.content} maxHeight={88} />
            )}

            {post.contentType === 'poll' && post.pollData && (
              <PollCard
                poll={post.pollData}
                userVote={pollUserVote ?? null}
                onVote={onPollVote ?? (() => {})}
              />
            )}

            {post.contentType === 'link' && post.linkPreview && (
              <View style={styles.linkWrapper}>
                <LinkPreviewCard preview={post.linkPreview} />
              </View>
            )}
          </View>

          {/* Images — outside contentArea so negative-margin bleed isn't clipped */}
          {post.contentType === 'image' && post.mediaUrls.length > 0 && (
            <View style={styles.imageWrapper}>
              <ImageGrid urls={post.mediaUrls} />
            </View>
          )}

          {/* Quote indicator — kept for quote posts */}
          {post.quoteOfId && (
            <RepostIndicator type="quote" label="Quoted post" />
          )}
        </>
      )}

      {/* Action row — always rendered for all post types */}
      <ActionRow
        post={post}
        onCommentPress={handleCommentPress}
        onSharePress={handleSharePress}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  displayName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
  },
  orgBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  orgBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.semiBold,
  },
  handleTimestamp: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  // Content area
  contentArea: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  textContent: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 22,
  },
  showMore: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    marginTop: spacing.xs,
  },

  imageWrapper: {
    marginHorizontal: -spacing.lg, // bleed to card edges
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  linkWrapper: {
    marginTop: spacing.xs,
  },
  // Repost / quote indicator
  repostIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  repostIcon: {
    fontSize: typography.sizes.base,
  },
  repostLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  // Three-dot report button — positioned at the trailing edge of the author row
  reportButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
    minHeight: 28,
  },
  reportButtonText: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    lineHeight: typography.sizes.lg,
  },
  // Repost banner ("@username reposted") — rendered at the very top of repost cards
  repostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  repostBannerText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  // Embedded original post card — bordered inset used inside repost cards
  embeddedCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  embeddedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  embeddedAuthorMeta: {
    flex: 1,
    gap: 2,
  },
  embeddedDisplayName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
  },
  embeddedHandleTimestamp: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
  },
  embeddedContent: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 20,
  },
  embeddedImageWrapper: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  // Action row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
  },
  actionIcon: {
    fontSize: typography.sizes.lg,
  },
  actionCount: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
})

export default PostCard
