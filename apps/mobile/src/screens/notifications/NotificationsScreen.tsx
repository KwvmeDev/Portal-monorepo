/**
 * NotificationsScreen — infinite-scroll list of the authenticated user's notifications.
 *
 * Features:
 *   - Cursor-based infinite scroll via useInfiniteQuery hitting GET /api/notifications
 *   - Pull-to-refresh via FlatList's refreshing prop
 *   - "Mark all read" action (PATCH /api/notifications/read-all) — only shown when
 *     unreadCount > 0, invalidates the ['notifications'] query on success
 *   - ActivityIndicator footer while fetching next page
 *   - EmptyState when the list is empty and not loading
 *   - ActivityIndicator for initial loading state
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { NotificationItem } from '../../components/ui/NotificationItem'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors, typography, spacing } from '../../theme/tokens'
import type { NotificationWithDetails, NotificationPage } from '@portal/types'
import { useLanguage } from '../../i18n/LanguageContext'

// ---------------------------------------------------------------------------
// NotificationsScreen
// ---------------------------------------------------------------------------

export function NotificationsScreen() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  // ── Infinite query: GET /api/notifications?cursor=... ─────────────────────

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => {
      const query = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<NotificationPage>(`/notifications${query}`)
    },
    initialPageParam: null as string | null,
    // Return undefined (not null) when there is no next page so react-query
    // knows there are no more pages to fetch.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // Flatten all pages into a single array for FlatList
  const flatNotifications: NotificationWithDetails[] =
    data?.pages.flatMap((page) => page.notifications) ?? []

  // Unread count lives on the first page — the server always reflects the
  // current total, not a per-page delta.
  const unreadCount = data?.pages[0]?.unreadCount ?? 0

  // ── Mark all read mutation: PATCH /api/notifications/read-all ─────────────

  const { mutate: markAllRead, isPending: isMarkingAllRead } = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      // Invalidate to refetch fresh data with updated isRead flags + unreadCount=0
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // ── FlatList callbacks ─────────────────────────────────────────────────────

  const renderItem: ListRenderItem<NotificationWithDetails> = useCallback(
    ({ item }) => <NotificationItem notification={item} />,
    [],
  )

  const keyExtractor = useCallback(
    (item: NotificationWithDetails) => item.id,
    [],
  )

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // ── Initial loading state ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('notifications')}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.signal} />
        </View>
      </SafeAreaView>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header row: title left, "Mark all read" right (conditional) */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Notifications</Text>

        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={() => markAllRead()}
            disabled={isMarkingAllRead}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text
              style={[
                styles.markAllText,
                isMarkingAllRead && styles.markAllTextDisabled,
              ]}
            >
              {t('markAllRead')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Separator beneath header */}
      <View style={styles.headerBorder} />

      <FlatList
        data={flatNotifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        refreshing={isRefetching}
        onRefresh={handleRefresh}
        contentContainerStyle={
          flatNotifications.length === 0 ? styles.emptyContainer : undefined
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.signal} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={<Text style={styles.emptyIcon}>🔔</Text>}
              title={t('noNotificationsYet')}
              subtitle={t('noNotificationsSubtitle')}
            />
          ) : null
        }
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.void,
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  markAllText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.signal,
  },
  markAllTextDisabled: {
    opacity: 0.5,
  },
  headerBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Loading ─────────────────────────────────────────────────────────────────

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer loader ───────────────────────────────────────────────────────────

  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },

  // ── Empty state ─────────────────────────────────────────────────────────────

  // Forces the FlatList content container to fill available space so the
  // EmptyState component can center itself with flex: 1.
  emptyContainer: {
    flexGrow: 1,
  },
  emptyIcon: {
    fontSize: 32,
  },
})

export default NotificationsScreen
