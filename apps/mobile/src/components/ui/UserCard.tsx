/**
 * UserCard — a single row in a user list (search results, followers, following).
 *
 * Layout:
 *   [Avatar 40px] | displayName (semiBold, paper)
 *                   @username   (muted, sm)
 *                   bio         (muted, sm, 1 line, optional)
 *
 * No internal separator — parent FlatList is expected to provide ItemSeparatorComponent.
 */

import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import type { UserSummary } from '@portal/types'
import { Avatar } from './Avatar'
import { colors, typography, spacing } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserCardProps {
  user: UserSummary
  onPress?: () => void
}

// ---------------------------------------------------------------------------
// UserCard
// ---------------------------------------------------------------------------

export function UserCard({ user, onPress }: UserCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`View ${user.displayName}'s profile`}
    >
      {/* Avatar — md size (40px) is the closest named size to the spec's 44px */}
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />

      {/* Text content column */}
      <View style={styles.content}>
        <Text style={styles.displayName} numberOfLines={1}>
          {user.displayName}
        </Text>

        <Text style={styles.username} numberOfLines={1}>
          @{user.username}
        </Text>

        {user.bio ? (
          <Text
            style={styles.bio}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {user.bio}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.void,
  },
  content: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  displayName: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  username: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 1,
  },
  bio: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 2,
  },
})

export default UserCard
