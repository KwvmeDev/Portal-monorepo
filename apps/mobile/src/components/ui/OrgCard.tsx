/**
 * OrgCard — a single row in an organisation list (search results, directory).
 *
 * Layout:
 *   [Avatar 40px] | org.name   (semiBold, paper)
 *                   @org.handle (muted, sm)
 *                   [type badge pill]  N members
 *
 * No internal separator — parent FlatList is expected to provide ItemSeparatorComponent.
 *
 * onPress is optional: when provided the card is wrapped in a TouchableOpacity;
 * when omitted it renders as a plain View (non-interactive display).
 */

import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import type { OrgSummary } from '@portal/types'
import { Avatar } from './Avatar'
import { colors, typography, spacing } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgCardProps {
  org: OrgSummary
  /** When provided the card content is wrapped in a TouchableOpacity. */
  onPress?: () => void
}

// ---------------------------------------------------------------------------
// OrgCard
// ---------------------------------------------------------------------------

export function OrgCard({ org, onPress }: OrgCardProps) {
  /** Inner card content — same layout regardless of pressability. */
  const cardContent = (
    <>
      {/* Avatar — md size (40px) is the closest named size to the spec's 44px */}
      <Avatar uri={org.avatarUrl} name={org.name} size="md" />

      {/* Text content column */}
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {org.name}
        </Text>

        <Text style={styles.handle} numberOfLines={1}>
          @{org.handle}
        </Text>

        {/* Meta row: type badge + member count */}
        <View style={styles.metaRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{org.type}</Text>
          </View>

          <Text style={styles.memberCount}>
            {org.memberCount} members
          </Text>
        </View>
      </View>
    </>
  )

  // Wrap in TouchableOpacity only when a press handler is provided.
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.container}
        accessibilityRole="button"
        accessibilityLabel={`View ${org.name}`}
      >
        {cardContent}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {cardContent}
    </View>
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
  name: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  handle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#1a1a1a',
  },
  typeBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },
  memberCount: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginLeft: spacing.xs,
  },
})

export default OrgCard
