/**
 * FeedList — infinite-scrolling, pull-to-refresh post list.
 *
 * Supports three feed types that each map to a distinct API endpoint:
 *   - 'global'  → GET /feed/global?cursor=
 *   - 'campus'  → GET /feed/campus?cursor=
 *   - 'org'     → GET /feed/org/:orgId?cursor=
 *
 * React Query's useInfiniteQuery handles cursor-based pagination; each page
 * returns a FeedPage with a nextCursor that seeds the subsequent request.
 */
import React, { useCallback } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { FeedPage, PostWithDetails } from '@portal/types'
import { api } from '../../services/api'
import { FeedSkeleton } from '../ui/LoadingSkeleton'
import { EmptyState } from '../ui/EmptyState'
import { PostCard } from '../ui/PostCard'
import { colors, spacing } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedType = 'global' | 'campus' | 'org'

export interface FeedListProps {
  feedType: FeedType
  /** Required when feedType === 'org'; the org whose feed is displayed. */
  orgId?: string
}

// ---------------------------------------------------------------------------
// API helpers — one pure function per feed type
// ---------------------------------------------------------------------------

function buildGlobalFeedUrl(cursor?: string): string {
  return cursor ? `/feed/global?cursor=${encodeURIComponent(cursor)}` : '/feed/global'
}

function buildCampusFeedUrl(cursor?: string): string {
  return cursor ? `/feed/campus?cursor=${encodeURIComponent(cursor)}` : '/feed/campus'
}

function buildOrgFeedUrl(orgId: string, cursor?: string): string {
  const base = `/feed/org/${encodeURIComponent(orgId)}`
  return cursor ? `${base}?cursor=${encodeURIComponent(cursor)}` : base
}

function resolveFeedUrl(feedType: FeedType, orgId: string | undefined, cursor?: string): string {
  switch (feedType) {
    case 'global':
      return buildGlobalFeedUrl(cursor)
    case 'campus':
      return buildCampusFeedUrl(cursor)
    case 'org': {
      if (!orgId) throw new Error('FeedList: orgId is required for org feed')
      return buildOrgFeedUrl(orgId, cursor)
    }
  }
}

async function fetchFeedPage(
  feedType: FeedType,
  orgId: string | undefined,
  cursor?: string,
): Promise<FeedPage> {
  const url = resolveFeedUrl(feedType, orgId, cursor)
  return api.get<FeedPage>(url)
}

// ---------------------------------------------------------------------------
// Query key factory — keeps cache keys stable and readable
// ---------------------------------------------------------------------------

function feedQueryKey(feedType: FeedType, orgId?: string): readonly unknown[] {
  return feedType === 'org' ? ['feed', feedType, orgId] : ['feed', feedType]
}

// ---------------------------------------------------------------------------
// Empty state config per feed type
// ---------------------------------------------------------------------------

interface EmptyConfig {
  icon: React.ReactNode
  title: string
  subtitle: string
}

function resolveEmptyConfig(feedType: FeedType): EmptyConfig {
  switch (feedType) {
    case 'global':
      return {
        icon: <Text style={styles.emptyIcon}>🌍</Text>,
        title: 'Nothing here yet',
        subtitle: 'No posts yet. Follow some people to get started.',
      }
    case 'campus':
      return {
        icon: <Text style={styles.emptyIcon}>🏫</Text>,
        title: 'Your campus is quiet',
        subtitle: 'No posts from your campus yet. Be the first.',
      }
    case 'org':
      return {
        icon: <Text style={styles.emptyIcon}>📋</Text>,
        title: "Nothing posted yet",
        subtitle: "This org hasn't posted yet.",
      }
  }
}


// ---------------------------------------------------------------------------
// FeedList component
// ---------------------------------------------------------------------------

export function FeedList({ feedType, orgId }: FeedListProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigation = useNavigation<any>()
  const queryKey = feedQueryKey(feedType, orgId)

  const {
    data,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<FeedPage, Error>({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFeedPage(feedType, orgId, pageParam as string | undefined),
    // The first page has no cursor; subsequent pages use the cursor from
    // the previous page's response.
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // Flatten all pages into a single array for FlatList.
  // useMemo is intentionally avoided here — FlatList re-renders only when the
  // reference changes, which happens naturally when data updates.
  const posts: PostWithDetails[] = data?.pages.flatMap((page) => page.posts) ?? []

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PostWithDetails>) => (
      <PostCard
        post={item}
        navigation={{
          navigateToPostDetail: (postId) => navigation.navigate('PostDetail', { postId }),
          navigateToUserProfile: (userId) => navigation.navigate('Profile', { screen: 'ProfileRoot', params: { userId } }),
          navigateToOrgProfile: (orgId) => navigation.navigate('OrgProfile', { orgId }),
        }}
      />
    ),
    [navigation],
  )

  const keyExtractor = useCallback((item: PostWithDetails) => item.id, [])

  // ── Render guards ─────────────────────────────────────────────────────────

  // Show skeleton only on the very first load — no data has been fetched yet.
  if (isLoading && !data) {
    return <FeedSkeleton />
  }

  const emptyConfig = resolveEmptyConfig(feedType)

  return (
    <FlatList<PostWithDetails>
      data={posts}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={handleEndReached}
      // Start fetching the next page when the user is 40% from the bottom.
      // This threshold prevents a jarring "blank" gap at the end of the list.
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isLoading}
          onRefresh={handleRefresh}
          tintColor={colors.signal}
          colors={[colors.signal]}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon={emptyConfig.icon}
          title={emptyConfig.title}
          subtitle={emptyConfig.subtitle}
        />
      }
      // No header content at this stage (ListHeaderComponent is null per spec)
      ListHeaderComponent={null}
      // Footer shows a subtle loading indicator while the next page loads
      ListFooterComponent={
        isFetchingNextPage
          ? <View style={styles.footerLoader}><FeedSkeleton /></View>
          : null
      }
      style={styles.list}
      contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
    />
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.void,
  },
  // When the list is empty the FlatList content container must expand to fill
  // the available height so EmptyState can centre itself vertically.
  emptyContainer: {
    flexGrow: 1,
  },
  emptyIcon: {
    fontSize: 40,
  },
  footerLoader: {
    paddingTop: spacing.lg,
  },
})
