/**
 * CommentThread — paginated list of comments for a single post.
 *
 * Fetches top-level comments and replies via infinite scroll.
 * Delegates individual comment rendering to CommentItem.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useInfiniteQuery } from '@tanstack/react-query'
import { CommentItem } from './CommentItem'
import { EmptyState } from '../ui/EmptyState'
import { api } from '../../services/api'
import { colors, typography, spacing } from '../../theme/tokens'
import type { CommentWithDetails, CommentPage } from '@portal/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentThreadProps {
  postId: string
  onReplyTo?: (comment: CommentWithDetails | null) => void
  /** Rendered above the "Comments" header — use this to avoid nesting a FlatList inside a ScrollView. */
  listHeaderComponent?: React.ReactElement | null
}

// ---------------------------------------------------------------------------
// CommentThread
// ---------------------------------------------------------------------------

export function CommentThread({ postId, onReplyTo, listHeaderComponent }: CommentThreadProps) {
  // Infinite query — pages keyed by cursor string
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery<CommentPage, Error>({
    queryKey: ['comments', postId],
    queryFn: ({ pageParam }) =>
      api.get<CommentPage>(`/posts/${postId}/comments?cursor=${pageParam ?? ''}`),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // Flatten all pages into a single array for FlatList
  const allComments: CommentWithDetails[] = data?.pages.flatMap((p) => p.comments) ?? []

  // -------------------------------------------------------------------------
  // Composed list header — caller content (post body) + "Comments" title
  // -------------------------------------------------------------------------
  const ListHeader = () => (
    <>
      {listHeaderComponent ?? null}
      <View style={styles.listHeader}>
        <Text style={styles.headerText}>Comments</Text>
      </View>
    </>
  )

  // -------------------------------------------------------------------------
  // Empty state — rendered via ListEmptyComponent so the header still shows
  // -------------------------------------------------------------------------
  const ListEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      )
    }
    return (
      <EmptyState
        icon={<Text style={styles.emptyIcon}>💬</Text>}
        title="No comments yet"
        subtitle="Be the first to share your thoughts."
      />
    )
  }

  // -------------------------------------------------------------------------
  // List footer — "Load more" button or spinner for next page fetch
  // -------------------------------------------------------------------------
  const ListFooter = () => {
    if (!hasNextPage) return null

    return (
      <View style={styles.footerContainer}>
        {isFetchingNextPage ? (
          <ActivityIndicator color={colors.muted} style={styles.footerSpinner} />
        ) : (
          <TouchableOpacity
            onPress={() => fetchNextPage()}
            style={styles.loadMoreButton}
            accessibilityRole="button"
            accessibilityLabel="Load more comments"
          >
            <Text style={styles.loadMoreText}>Load more</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <FlatList<CommentWithDetails>
      data={allComments}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <CommentItem
          comment={item}
          isReply={item.parentId !== null}
          onReply={onReplyTo}
          postId={postId}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      ListFooterComponent={ListFooter}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={allComments.length === 0 ? styles.emptyContainer : undefined}
    />
  )
}

// ---------------------------------------------------------------------------
// Styles — all values from tokens, no hardcoded colors
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  emptyContainer: {
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 32,
  },
  listHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.sizes.md,
    color: colors.paper,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  footerContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerSpinner: {
    paddingVertical: spacing.sm,
  },
  loadMoreButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  loadMoreText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.muted,
  },
})

export default CommentThread
