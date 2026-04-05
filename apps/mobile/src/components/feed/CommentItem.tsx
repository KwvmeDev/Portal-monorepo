/**
 * CommentItem — renders a single comment or reply with vote controls.
 *
 * Supports optimistic voting: local state is updated immediately on tap,
 * then reverted on API error. Replies are visually indented via marginLeft.
 */

import React, { useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../ui/Avatar'
import { api, type ApiError } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { colors, typography, spacing } from '../../theme/tokens'
import type { CommentWithDetails, VoteState, VoteValue } from '@portal/types'

// ---------------------------------------------------------------------------
// Types
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

interface CommentItemProps {
  comment: CommentWithDetails
  isReply?: boolean
  onReply?: (comment: CommentWithDetails) => void
  postId: string
}

// Local vote state — kept in sync atomically to avoid tearing on rapid taps
interface LocalVoteState {
  upvotes: number
  downvotes: number
  userVote: VoteValue | null
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable time string relative to the given ISO date.
 * Thresholds: < 60s → Xs, < 60m → Xm, < 24h → Xh, else → Xd
 */
function timeAgo(isoString: string): string {
  const elapsed = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)

  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`
  return `${Math.floor(elapsed / 86400)}d`
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

export function CommentItem({ comment, isReply = false, onReply, postId }: CommentItemProps) {
  const queryClient = useQueryClient()
  // Determine if the current viewer authored this comment — hides the report button if so
  const currentUser = useAuthStore((state) => state.user)
  const isOwnComment = comment.authorId === currentUser?.id

  // Local optimistic vote state — initialised from server data
  const [localVotes, setLocalVotes] = useState<LocalVoteState>({
    upvotes: comment.upvotes,
    downvotes: comment.downvotes,
    userVote: comment.userVote,
  })

  // -------------------------------------------------------------------------
  // Mutation: POST /comments/:id/vote — cast or switch vote
  // -------------------------------------------------------------------------
  const { mutate: castVote } = useMutation<VoteState, Error, VoteValue, LocalVoteState>({
    mutationFn: (value) =>
      api.post<VoteState>(`/comments/${comment.id}/vote`, { value }),
    onMutate: (value) => {
      // Snapshot current state for potential rollback
      const snapshot = { ...localVotes }

      // Optimistically apply: if same vote exists, clear it; otherwise set it
      if (localVotes.userVote === value) {
        setLocalVotes({
          upvotes: value === 'up' ? localVotes.upvotes - 1 : localVotes.upvotes,
          downvotes: value === 'down' ? localVotes.downvotes - 1 : localVotes.downvotes,
          userVote: null,
        })
      } else if (localVotes.userVote === null) {
        setLocalVotes({
          upvotes: value === 'up' ? localVotes.upvotes + 1 : localVotes.upvotes,
          downvotes: value === 'down' ? localVotes.downvotes + 1 : localVotes.downvotes,
          userVote: value,
        })
      } else {
        // Switching direction
        setLocalVotes({
          upvotes: value === 'up' ? localVotes.upvotes + 1 : localVotes.upvotes - 1,
          downvotes: value === 'down' ? localVotes.downvotes + 1 : localVotes.downvotes - 1,
          userVote: value,
        })
      }

      return snapshot
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
    },
    onError: (_err, _value, snapshot) => {
      // Revert to the state we captured in onMutate
      if (snapshot !== undefined) {
        setLocalVotes(snapshot)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Mutation: DELETE /comments/:id/vote — remove existing vote
  // -------------------------------------------------------------------------
  const { mutate: removeVote } = useMutation<VoteState, Error, void, LocalVoteState>({
    mutationFn: () => api.del<VoteState>(`/comments/${comment.id}/vote`),
    onMutate: () => {
      const snapshot = { ...localVotes }

      // Optimistically clear the active vote
      setLocalVotes({
        upvotes: localVotes.userVote === 'up' ? localVotes.upvotes - 1 : localVotes.upvotes,
        downvotes: localVotes.userVote === 'down' ? localVotes.downvotes - 1 : localVotes.downvotes,
        userVote: null,
      })

      return snapshot
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
    },
    onError: (_err, _value, snapshot) => {
      if (snapshot !== undefined) {
        setLocalVotes(snapshot)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Mutation: POST /reports — submit a report for this comment
  // -------------------------------------------------------------------------
  const { mutate: submitReport, isPending: isReporting } = useMutation<void, ApiError, ReportReason>({
    mutationFn: (reason) =>
      api.post<void>('/reports', { targetId: comment.id, targetType: 'comment', reason }),
    onSuccess: () => {
      Alert.alert('Reported', 'Thank you for your report')
    },
    onError: (error) => {
      // 409 means already reported — ignore silently
      if (error.statusCode === 409) return
      Alert.alert('Error', 'Could not submit report')
    },
  })

  // Shows the two-step Alert flow: options sheet → reason picker
  const showReasonPicker = useCallback(() => {
    Alert.alert(
      'Report Comment',
      'Select a reason:',
      [
        ...REPORT_REASON_LABELS.map(({ value, label }) => ({
          text: label,
          onPress: () => submitReport(value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    )
  }, [submitReport])

  const handleReportPress = useCallback(() => {
    Alert.alert('', '', [
      { text: 'Report Comment', onPress: showReasonPicker },
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }, [showReasonPicker])

  // -------------------------------------------------------------------------
  // Tap handler — decides cast vs remove based on current userVote
  // -------------------------------------------------------------------------
  const handleVote = useCallback(
    (direction: VoteValue) => {
      if (localVotes.userVote === direction) {
        removeVote()
      } else {
        castVote(direction)
      }
    },
    [localVotes.userVote, castVote, removeVote],
  )

  const handleUpvote = useCallback(() => handleVote('up'), [handleVote])
  const handleDownvote = useCallback(() => handleVote('down'), [handleVote])
  const handleReply = useCallback(() => onReply?.(comment), [onReply, comment])

  const { author } = comment
  const isUpvoteActive = localVotes.userVote === 'up'
  const isDownvoteActive = localVotes.userVote === 'down'

  return (
    <View style={[styles.container, isReply && styles.replyIndent]}>
      {/* Author avatar — smaller for nested replies */}
      <Avatar
        uri={author.avatarUrl}
        name={author.displayName}
        size={isReply ? 'xs' : 'sm'}
      />

      {/* Content column */}
      <View style={styles.contentColumn}>
        {/* Author info row with optional three-dot report button at trailing edge */}
        <View style={styles.metaRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {author.displayName}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{author.username}
          </Text>
          <Text style={styles.separator}> · </Text>
          <Text style={styles.timestamp}>{timeAgo(comment.createdAt)}</Text>

          {/* Three-dot report button — hidden for own comments */}
          {!isOwnComment && (
            <TouchableOpacity
              onPress={handleReportPress}
              activeOpacity={0.7}
              style={styles.reportButton}
              accessibilityRole="button"
              accessibilityLabel="Report comment"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isReporting ? (
                <ActivityIndicator size="small" color={colors.muted} />
              ) : (
                <Text style={styles.reportButtonText}>⋯</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Comment body — muted italic when removed by moderator */}
        {comment.isRemoved ? (
          <Text style={styles.removedText}>[Comment removed]</Text>
        ) : (
          <Text style={styles.contentText}>{comment.content}</Text>
        )}

        {/* Action footer: vote buttons + optional reply */}
        <View style={styles.footerRow}>
          {/* Upvote */}
          <TouchableOpacity
            onPress={handleUpvote}
            style={styles.voteButton}
            accessibilityRole="button"
            accessibilityLabel="Upvote comment"
            accessibilityState={{ selected: isUpvoteActive }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.voteGlyph, isUpvoteActive && styles.upvoteActive]}>
              ▲
            </Text>
            <Text style={[styles.voteCount, isUpvoteActive && styles.upvoteActive]}>
              {localVotes.upvotes}
            </Text>
          </TouchableOpacity>

          {/* Downvote */}
          <TouchableOpacity
            onPress={handleDownvote}
            style={styles.voteButton}
            accessibilityRole="button"
            accessibilityLabel="Downvote comment"
            accessibilityState={{ selected: isDownvoteActive }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.voteGlyph, isDownvoteActive && styles.downvoteActive]}>
              ▼
            </Text>
            <Text style={[styles.voteCount, isDownvoteActive && styles.downvoteActive]}>
              {localVotes.downvotes}
            </Text>
          </TouchableOpacity>

          {/* Reply — only rendered when a handler is provided */}
          {onReply !== undefined && (
            <TouchableOpacity
              onPress={handleReply}
              style={styles.replyButton}
              accessibilityRole="button"
              accessibilityLabel="Reply to comment"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.replyText}>Reply</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles — all values from tokens except '#FF453A' (downvote active, not in tokens)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Indentation applied to replies so they nest under their parent
  replyIndent: {
    marginLeft: 44,
  },
  contentColumn: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
  displayName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.sizes.sm,
    color: colors.paper,
    marginRight: spacing.xs,
  },
  username: {
    fontSize: typography.sizes.xs,
    color: colors.muted,
    fontFamily: typography.fontFamily.regular,
  },
  separator: {
    fontSize: typography.sizes.xs,
    color: colors.muted,
    fontFamily: typography.fontFamily.regular,
  },
  timestamp: {
    fontSize: typography.sizes.xs,
    color: colors.muted,
    fontFamily: typography.fontFamily.regular,
  },
  contentText: {
    fontSize: typography.sizes.base,
    color: colors.paper,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.sizes.base * 1.5,
    marginBottom: spacing.sm,
  },
  removedText: {
    fontSize: typography.sizes.base,
    color: colors.muted,
    fontFamily: typography.fontFamily.regular,
    fontStyle: 'italic',
    lineHeight: typography.sizes.base * 1.5,
    marginBottom: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  voteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  voteGlyph: {
    fontSize: typography.sizes.sm,
    color: colors.muted,
    fontFamily: typography.fontFamily.regular,
  },
  voteCount: {
    fontSize: typography.sizes.sm,
    color: colors.muted,
    fontFamily: typography.fontFamily.medium,
  },
  // Active state colors — signal green for upvote
  upvoteActive: {
    color: colors.signal,
  },
  // '#FF453A' is the iOS destructive red; intentionally not in the token palette
  downvoteActive: {
    color: '#FF453A',
  },
  replyButton: {
    paddingVertical: spacing.xs,
  },
  replyText: {
    fontSize: typography.sizes.sm,
    color: colors.muted,
    fontFamily: typography.fontFamily.medium,
  },
  // Three-dot report button — sits at the trailing end of the metaRow
  reportButton: {
    marginLeft: 'auto',
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 24,
    minHeight: 24,
  },
  reportButtonText: {
    fontSize: typography.sizes.base,
    color: colors.muted,
    fontFamily: typography.fontFamily.bold,
    lineHeight: typography.sizes.base,
  },
})

export default CommentItem
