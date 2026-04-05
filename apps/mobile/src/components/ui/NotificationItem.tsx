/**
 * NotificationItem — single row in the notifications list.
 *
 * Layout:
 *   [Actor avatar 40px] | notification copy text (e.g. "@alice followed you")
 *                         timeAgo                    [unread dot — only if !isRead]
 *
 * Avatar: uses Image when actorAvatarUrl is present, falls back to a circle
 * showing the first character of actorDisplayName. This mirrors the Avatar
 * component approach without pulling in the useTheme dependency.
 *
 * Unread dot: 8×8 filled circle in colors.signal positioned at far right of row.
 */

import React from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import type { NotificationWithDetails, NotificationType } from '@portal/types'
import { colors, typography, spacing } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NotificationItemProps {
  notification: NotificationWithDetails
}

// ---------------------------------------------------------------------------
// Time helper — converts an ISO date string to a short relative string.
// Examples: "2m ago", "3h ago", "1d ago", "2w ago"
// ---------------------------------------------------------------------------

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  const diffWeeks = Math.floor(diffDays / 7)
  return `${diffWeeks}w ago`
}

// ---------------------------------------------------------------------------
// Copy helper — maps notification type to human-readable copy.
// All copies begin with "@{actorUsername}" per the spec.
// ---------------------------------------------------------------------------

function buildCopyText(type: NotificationType, actorUsername: string): string {
  const handle = `@${actorUsername}`

  switch (type) {
    case 'follow':
      return `${handle} followed you`
    case 'upvote_post':
      return `${handle} upvoted your post`
    case 'comment':
      return `${handle} commented on your post`
    case 'reply':
      return `${handle} replied to your comment`
    case 'mention':
      return `${handle} mentioned you`
    default:
      return `${handle} interacted with you`
  }
}

// ---------------------------------------------------------------------------
// NotificationItem
// ---------------------------------------------------------------------------

export function NotificationItem({ notification }: NotificationItemProps) {
  const {
    actorAvatarUrl,
    actorDisplayName,
    actorUsername,
    type,
    isRead,
    createdAt,
  } = notification

  const copyText = buildCopyText(type, actorUsername)
  const timeString = timeAgo(createdAt)

  // First character of display name used as fallback initials (single char spec)
  const fallbackInitial = actorDisplayName?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <View
      style={styles.row}
      accessibilityLabel={copyText}
      accessibilityHint={timeString}
    >
      {/* Actor avatar — image or initials fallback */}
      {actorAvatarUrl ? (
        <Image
          source={{ uri: actorAvatarUrl }}
          style={styles.avatar}
          accessibilityLabel={`${actorDisplayName}'s avatar`}
        />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{fallbackInitial}</Text>
        </View>
      )}

      {/* Text column: copy + timeAgo */}
      <View style={styles.content}>
        <Text style={styles.copyText} numberOfLines={2}>
          {copyText}
        </Text>
        <Text style={styles.timeText}>{timeString}</Text>
      </View>

      {/* Unread dot — only rendered when the notification has not been read */}
      {!isRead && <View style={styles.unreadDot} />}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 40

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.void,
  },

  // ── Avatar ──────────────────────────────────────────────────────────────────

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    resizeMode: 'cover',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },

  // ── Text column ─────────────────────────────────────────────────────────────

  content: {
    flex: 1,
    marginLeft: spacing.sm,
    // Leave right margin so the unread dot never overlaps the text
    marginRight: spacing.sm,
  },
  copyText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.paper,
    lineHeight: typography.sizes.base * 1.4,
  },
  timeText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 2,
  },

  // ── Unread dot ───────────────────────────────────────────────────────────────

  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.signal,
    // Align to the vertical midpoint of the row via parent alignItems: 'center'
    flexShrink: 0,
  },
})

export default NotificationItem
