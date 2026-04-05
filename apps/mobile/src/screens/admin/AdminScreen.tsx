/**
 * AdminScreen — Flagged content moderation queue for super_admin users.
 *
 * Features:
 *   - Infinite scroll via useInfiniteQuery hitting GET /api/reports?status=pending
 *   - Each report row shows: targetType badge, reason, reporter username,
 *     createdAt timeAgo, and content/username preview
 *   - Approve (outlined) and Remove (filled red) action buttons per row
 *   - Both actions call PATCH /api/reports/:id with { action } and invalidate
 *     the ['reports'] query key on success
 *   - ActivityIndicator for initial load; EmptyState when queue is empty
 *   - Pull-to-refresh via FlatList refreshing prop
 *
 * Access: only reachable from SettingsScreen when user.role === 'super_admin'.
 * Not visible in the tab navigator.
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
import { useNavigation } from '@react-navigation/native'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import { useLanguage } from '../../i18n/LanguageContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TargetType = 'post' | 'comment' | 'user'

interface Reporter {
  username: string
  displayName: string
}

interface Reviewer {
  username: string
  displayName: string
}

interface Report {
  id: string
  reporterId: string
  targetId: string
  targetType: TargetType
  reason: string
  details: string | null
  status: string
  createdAt: string
  reviewer: Reviewer | null
  reporter: Reporter
}

interface ReportsPage {
  reports: Report[]
  nextCursor: string | null
  total: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a simple relative time string (e.g. "2h ago", "3d ago").
 * Only handles the common cases — no library dependency needed.
 */
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/** Badge background color keyed by targetType. */
const BADGE_COLORS: Record<TargetType, string> = {
  post: '#3B82F6',    // blue
  comment: '#22C55E', // green
  user: '#F97316',    // orange
}

// ---------------------------------------------------------------------------
// ReportRow
// ---------------------------------------------------------------------------

interface ReportRowProps {
  report: Report
  onAction: (id: string, action: 'approve' | 'remove') => void
  isActioning: boolean
}

function ReportRow({ report, onAction, isActioning }: ReportRowProps) {
  const { t } = useLanguage()
  const badgeColor = BADGE_COLORS[report.targetType] ?? colors.muted

  return (
    <View style={styles.row}>
      {/* Row 1: badge + reason + time */}
      <View style={styles.rowTop}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{report.targetType}</Text>
        </View>
        <Text style={styles.reasonText} numberOfLines={1}>
          {report.reason}
        </Text>
        <Text style={styles.timeText}>{timeAgo(report.createdAt)}</Text>
      </View>

      {/* Row 2: reporter username */}
      <Text style={styles.reporterText}>
        Reported by @{report.reporter.username}
      </Text>

      {/* Row 3: details preview (only when present) */}
      {report.details ? (
        <Text style={styles.detailsText} numberOfLines={1}>
          {report.details}
        </Text>
      ) : null}

      {/* Action row: Approve + Remove */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          onPress={() => onAction(report.id, 'approve')}
          disabled={isActioning}
          activeOpacity={0.8}
          style={[styles.actionButton, styles.approveButton, isActioning && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Approve report ${report.id}`}
        >
          <Text style={styles.approveText}>{t('approve')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onAction(report.id, 'remove')}
          disabled={isActioning}
          activeOpacity={0.8}
          style={[styles.actionButton, styles.removeButton, isActioning && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Remove content for report ${report.id}`}
        >
          <Text style={styles.removeText}>{t('removeContent')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// AdminScreen
// ---------------------------------------------------------------------------

export function AdminScreen() {
  const navigation = useNavigation()
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  // ── Infinite query: GET /api/reports?status=pending&cursor=... ─────────────

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['reports'],
    queryFn: ({ pageParam }) => {
      const base = '/reports?status=pending'
      const query = pageParam ? `${base}&cursor=${pageParam}` : base
      return api.get<ReportsPage>(query)
    },
    initialPageParam: null as string | null,
    // Return undefined when there is no next cursor so react-query knows
    // there are no more pages to fetch.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // Flatten all pages into a single array for FlatList
  const reports: Report[] = data?.pages.flatMap((page) => page.reports) ?? []

  // ── Action mutation: PATCH /api/reports/:id ────────────────────────────────

  const { mutate: resolveReport, isPending: isActioning } = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'remove' }) =>
      api.patch(`/reports/${id}`, { action }),
    onSuccess: () => {
      // Refresh the queue so acted-upon reports disappear
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  const handleAction = useCallback(
    (id: string, action: 'approve' | 'remove') => {
      resolveReport({ id, action })
    },
    [resolveReport],
  )

  // ── FlatList callbacks ─────────────────────────────────────────────────────

  const renderItem: ListRenderItem<Report> = useCallback(
    ({ item }) => (
      <ReportRow
        report={item}
        onAction={handleAction}
        // Disable all buttons while any mutation is in flight to prevent
        // double-submits across different rows.
        isActioning={isActioning}
      />
    ),
    [handleAction, isActioning],
  )

  const keyExtractor = useCallback((item: Report) => item.id, [])

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
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin — Reports</Text>
          <View style={styles.backButton} />
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin — Reports</Text>
        {/* Spacer keeps title centred */}
        <View style={styles.backButton} />
      </View>

      <View style={styles.headerBorder} />

      <FlatList
        data={reports}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        refreshing={isRefetching}
        onRefresh={handleRefresh}
        contentContainerStyle={
          reports.length === 0 ? styles.emptyContainer : undefined
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
              icon={<Text style={styles.emptyIcon}>🛡️</Text>}
              title={t('noPendingReports')}
              subtitle={t('allReviewedSubtitle')}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    minWidth: 40,
    paddingVertical: spacing.xs,
  },
  backArrow: {
    fontSize: typography.sizes.xl,
    color: colors.paper,
    lineHeight: typography.sizes.xl + 4,
  },
  headerTitle: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    flex: 1,
    textAlign: 'center',
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

  // ── Report row ──────────────────────────────────────────────────────────────

  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.void,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },

  // ── Target type badge ───────────────────────────────────────────────────────

  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.semiBold,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  reasonText: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.paper,
  },
  timeText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },

  // ── Reporter / details ──────────────────────────────────────────────────────

  reporterText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  detailsText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    fontStyle: 'italic',
    color: colors.muted,
    marginBottom: spacing.xs,
  },

  // ── Action buttons ──────────────────────────────────────────────────────────

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  // Outlined style using colors.paper for border and text
  approveButton: {
    borderWidth: 1,
    borderColor: colors.paper,
    backgroundColor: 'transparent',
  },
  approveText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  // Filled red for destructive remove action
  removeButton: {
    backgroundColor: '#FF3B30',
  },
  removeText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: '#FFFFFF',
  },

  // ── Separator ───────────────────────────────────────────────────────────────

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },

  // ── Footer loader ───────────────────────────────────────────────────────────

  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },

  // ── Empty state ─────────────────────────────────────────────────────────────

  emptyContainer: {
    flexGrow: 1,
  },
  emptyIcon: {
    fontSize: 32,
  },
})

export default AdminScreen
