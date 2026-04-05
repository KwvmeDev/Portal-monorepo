/**
 * OrgProfileScreen — full org profile with animated tab bar (Posts | Members).
 *
 * Route param: { orgId: string }
 *
 * Header section shows:
 *   - Org avatar (xl ~80px, closest to spec's 72px named size)
 *   - Name + @handle
 *   - Type badge pill
 *   - Description (when present)
 *   - Member count + post count stats row
 *   - Join / Request / Pending / Leave button based on membershipStatus
 *
 * Tab bar: animated underline matching the ProfileScreen / FeedScreen pattern
 * exactly — same SharedValue approach, makeOnLayout, handleTabPress.
 */
import React, { useCallback, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  type LayoutChangeEvent,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RouteProp } from '@react-navigation/native'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/ui/Avatar'
import { PostCard } from '../../components/ui/PostCard'
import { colors, typography, spacing } from '../../theme/tokens'
import type { OrgProfile, OrgMember, OrgChapter, PostWithDetails } from '@portal/types'
import { useLanguage } from '../../i18n/LanguageContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width

/** Duration for the underline slide animation in milliseconds. */
const INDICATOR_ANIMATION_MS = 200

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

type TabKey = 'posts' | 'members' | 'chapters'

interface TabConfig {
  key: TabKey
  label: string
}

// ---------------------------------------------------------------------------
// Route param type — React Navigation style
// ---------------------------------------------------------------------------

export type OrgProfileRouteParams = {
  OrgProfile: { orgId: string }
}

interface OrgProfileScreenProps {
  route: RouteProp<OrgProfileRouteParams, 'OrgProfile'>
}

// ---------------------------------------------------------------------------
// API response shapes for paginated endpoints
// ---------------------------------------------------------------------------

interface OrgFeedPage {
  posts: PostWithDetails[]
  nextCursor: string | null
  hasMore: boolean
}

interface OrgMembersPage {
  members: OrgMember[]
  nextCursor: string | null
  hasMore: boolean
}

// ---------------------------------------------------------------------------
// Animated underline indicator — identical to ProfileScreen / FeedScreen pattern
// ---------------------------------------------------------------------------

interface IndicatorProps {
  translateX: Animated.SharedValue<number>
  indicatorWidth: Animated.SharedValue<number>
}

/**
 * Thin underline bar that slides horizontally to sit beneath the active tab.
 * Width matches the active tab label's measured width for a tight fit.
 */
function TabIndicator({ translateX, indicatorWidth }: IndicatorProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth.value,
  }))

  return <Animated.View style={[styles.indicator, animatedStyle]} />
}

// ---------------------------------------------------------------------------
// Individual tab button — identical to ProfileScreen pattern
// ---------------------------------------------------------------------------

interface TabButtonProps {
  label: string
  isActive: boolean
  onPress: () => void
  onLayout: (e: LayoutChangeEvent) => void
}

function TabButton({ label, isActive, onPress, onLayout }: TabButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLayout={onLayout}
      activeOpacity={0.7}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Text
        style={[
          styles.tabLabel,
          isActive ? styles.tabLabelActive : styles.tabLabelInactive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  message: string
}

function EmptyState({ message }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// No-op navigation stub for PostCard — deep-link navigation wired in later sprint
// ---------------------------------------------------------------------------

const noOpNavigation = {
  navigateToPostDetail: (_postId: string) => {},
  navigateToUserProfile: (_userId: string) => {},
  navigateToOrgProfile: (_orgId: string) => {},
}

// ---------------------------------------------------------------------------
// Posts tab — infinite list from GET /api/orgs/:id/feed
// ---------------------------------------------------------------------------

interface PostsTabProps {
  orgId: string
}

function PostsTab({ orgId }: PostsTabProps) {
  const { t } = useLanguage()
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['orgFeed', orgId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<OrgFeedPage>(`/orgs/${orgId}/feed${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const posts = data?.pages.flatMap((page) => page.posts) ?? []

  const renderItem: ListRenderItem<PostWithDetails> = useCallback(
    ({ item }) => (
      <PostCard post={item} navigation={noOpNavigation} />
    ),
    [],
  )

  const keyExtractor = useCallback((item: PostWithDetails) => item.id, [])

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.signal} />
      </View>
    )
  }

  return (
    <FlatList
      data={posts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      scrollEnabled={false}
      ListEmptyComponent={<EmptyState message={t('noPostsYet')} />}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator color={colors.signal} />
          </View>
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Members tab — infinite list from GET /api/orgs/:id/members
// ---------------------------------------------------------------------------

interface MembersTabProps {
  orgId: string
}

/** Pill badge for member role display (member | admin | owner). */
function RoleBadge({ role }: { role: OrgMember['role'] }) {
  const label = role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member'
  return (
    <View style={styles.roleBadge}>
      <Text style={styles.roleBadgeText}>{label}</Text>
    </View>
  )
}

function MembersTab({ orgId }: MembersTabProps) {
  const { t } = useLanguage()
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['orgMembers', orgId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<OrgMembersPage>(`/orgs/${orgId}/members${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const members = data?.pages.flatMap((page) => page.members) ?? []

  const renderItem: ListRenderItem<OrgMember> = useCallback(
    ({ item }) => (
      <View style={styles.memberRow}>
        <Avatar uri={item.avatarUrl} name={item.displayName} size="md" />
        <View style={styles.memberInfo}>
          <Text style={styles.memberDisplayName} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.memberUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
        <RoleBadge role={item.role} />
      </View>
    ),
    [],
  )

  const keyExtractor = useCallback((item: OrgMember) => item.userId, [])

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.signal} />
      </View>
    )
  }

  return (
    <FlatList
      data={members}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
      ListEmptyComponent={<EmptyState message={t('noMembersYet')} />}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator color={colors.signal} />
          </View>
        ) : null
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Chapters tab — list of university chapters for an umbrella org
// ---------------------------------------------------------------------------

interface ChaptersTabProps {
  orgId: string
}

interface ChaptersResponse {
  chapters: OrgChapter[]
}

function ChaptersTab({ orgId }: ChaptersTabProps) {
  const { t } = useLanguage()
  const { data, isLoading } = useQuery({
    queryKey: ['orgChapters', orgId],
    queryFn: () => api.get<ChaptersResponse>(`/orgs/${orgId}/chapters`),
  })

  const chapters = data?.chapters ?? []

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.signal} />
      </View>
    )
  }

  return (
    <FlatList
      data={chapters}
      keyExtractor={(item) => item.id}
      scrollEnabled={false}
      ItemSeparatorComponent={() => <View style={styles.memberSeparator} />}
      ListEmptyComponent={<EmptyState message={t('noChaptersYet')} />}
      renderItem={({ item }) => (
        <View style={styles.memberRow}>
          <Avatar uri={item.avatarUrl} name={item.name} size="md" />
          <View style={styles.memberInfo}>
            <Text style={styles.memberDisplayName} numberOfLines={1}>
              {item.universityName ?? item.name}
            </Text>
            <Text style={styles.memberUsername} numberOfLines={1}>
              @{item.handle} · {item.memberCount} member{item.memberCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Join / Leave button
// ---------------------------------------------------------------------------

interface JoinLeaveButtonProps {
  orgId: string
  membershipStatus: OrgProfile['membershipStatus']
  /** true when the org's visibility is 'invite_only' (i.e. private). */
  isPrivate: boolean
}

/**
 * Renders the appropriate join/leave CTA based on the viewer's current
 * membership status and the org's visibility setting:
 *
 *   membershipStatus='none'  + public  → 'Join'    (enabled)
 *   membershipStatus='none'  + private → 'Request' (enabled)
 *   membershipStatus='pending'         → 'Pending' (disabled)
 *   membershipStatus='member'          → 'Leave'   (enabled)
 *   membershipStatus='admin'           → 'Leave'   (enabled)
 */
function JoinLeaveButton({ orgId, membershipStatus, isPrivate }: JoinLeaveButtonProps) {
  const queryClient = useQueryClient()
  const { t } = useLanguage()

  const { mutate: join, isPending: isJoining } = useMutation({
    mutationFn: () => api.post(`/orgs/${orgId}/join`),
    onSuccess: () => {
      // Invalidate the org profile so membershipStatus refreshes
      queryClient.invalidateQueries({ queryKey: ['orgProfile', orgId] })
    },
  })

  const { mutate: leave, isPending: isLeaving } = useMutation({
    mutationFn: () => api.del(`/orgs/${orgId}/leave`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgProfile', orgId] })
    },
  })

  const isPending = isJoining || isLeaving

  if (membershipStatus === 'pending') {
    return (
      <View style={[styles.joinButton, styles.joinButtonDisabled]}>
        <Text style={[styles.joinButtonLabel, styles.joinButtonLabelMuted]}>
          {t('pendingMembership')}
        </Text>
      </View>
    )
  }

  if (membershipStatus === 'member' || membershipStatus === 'admin') {
    return (
      <TouchableOpacity
        onPress={() => { if (!isPending) leave() }}
        disabled={isPending}
        activeOpacity={0.8}
        style={[styles.joinButton, styles.joinButtonLeave]}
        accessibilityRole="button"
        accessibilityLabel="Leave organisation"
      >
        {isPending ? (
          <ActivityIndicator size="small" color={colors.paper} />
        ) : (
          <Text style={[styles.joinButtonLabel, styles.joinButtonLabelLeave]}>
            {t('leaveOrg')}
          </Text>
        )}
      </TouchableOpacity>
    )
  }

  // membershipStatus === 'none'
  const label = isPrivate ? t('requestToJoin') : t('joinOrg')
  return (
    <TouchableOpacity
      onPress={() => { if (!isPending) join() }}
      disabled={isPending}
      activeOpacity={0.8}
      style={[styles.joinButton, styles.joinButtonJoin]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={colors.void} />
      ) : (
        <Text style={[styles.joinButtonLabel, styles.joinButtonLabelJoin]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// OrgProfileScreen
// ---------------------------------------------------------------------------

export function OrgProfileScreen({ route }: OrgProfileScreenProps) {
  const { orgId } = route.params
  const currentUser = useAuthStore((s) => s.user)
  const { t } = useLanguage()

  const [activeIndex, setActiveIndex] = useState(0)

  const translateX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)

  const tabOffsets = useRef<number[]>([0, 0, 0])
  const tabWidths = useRef<number[]>([0, 0, 0])

  const { data: orgProfile, isLoading } = useQuery({
    queryKey: ['orgProfile', orgId],
    queryFn: () => api.get<OrgProfile>(`/orgs/${orgId}`),
  })

  // --------------------------------------------------------------------------
  // Measurement callbacks — called once per tab on first render
  // --------------------------------------------------------------------------

  const makeOnLayout = useCallback(
    (index: number) =>
      (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout
        tabOffsets.current[index] = x
        tabWidths.current[index] = width

        // Initialise the indicator position on the first (default) tab.
        if (index === 0) {
          indicatorWidth.value = width
          translateX.value = x
        }
      },
    // indicatorWidth and translateX are Reanimated shared values — stable refs.
    [indicatorWidth, translateX],
  )

  // --------------------------------------------------------------------------
  // Tab press handler
  // --------------------------------------------------------------------------

  const handleTabPress = useCallback(
    (index: number) => {
      setActiveIndex(index)

      const targetX = tabOffsets.current[index]
      const targetWidth = tabWidths.current[index]

      // Animate the underline to slide from its current position to the new tab.
      const timing = { duration: INDICATOR_ANIMATION_MS, easing: Easing.out(Easing.quad) }
      translateX.value = withTiming(targetX, timing)
      indicatorWidth.value = withTiming(targetWidth, timing)
    },
    [translateX, indicatorWidth],
  )

  // --------------------------------------------------------------------------
  // Loading / error states
  // --------------------------------------------------------------------------

  if (isLoading || !orgProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.signal} />
        </View>
      </SafeAreaView>
    )
  }

  const showJoinLeave = !!currentUser
  const isPrivate = orgProfile.visibility === 'invite_only'
  const TABS: TabConfig[] = [
    { key: 'posts', label: t('posts') },
    { key: 'members', label: t('members') },
    ...(orgProfile.chapterCount > 0 ? [{ key: 'chapters' as TabKey, label: t('chapters') }] : []),
  ]

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        Outer FlatList with empty data — the header contains the profile info
        + tab bar, and the footer holds the active tab content. This mirrors
        the ProfileScreen pattern so the header scrolls away with content.
      */}
      <FlatList
        data={[]}
        renderItem={null}
        style={styles.list}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <View>
            {/* ── Org header ──────────────────────────────────────────────── */}
            <View style={styles.header}>
              {/* Avatar — xl (80px) is the closest named size to spec's 72px */}
              <Avatar uri={orgProfile.avatarUrl} name={orgProfile.name} size="xl" />

              {/* Org name */}
              <Text style={styles.orgName} numberOfLines={1}>
                {orgProfile.name}
              </Text>

              {/* @handle */}
              <Text style={styles.orgHandle} numberOfLines={1}>
                @{orgProfile.handle}
              </Text>

              {/* Type badge pill */}
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{orgProfile.type}</Text>
              </View>

              {/* Parent org link — shown on chapter orgs */}
              {orgProfile.parentOrg ? (
                <Text style={styles.parentOrgLink} numberOfLines={1}>
                  Part of{' '}
                  <Text style={styles.parentOrgName}>{orgProfile.parentOrg.name}</Text>
                </Text>
              ) : null}

              {/* Description — only rendered when present */}
              {orgProfile.description ? (
                <Text style={styles.description} numberOfLines={4}>
                  {orgProfile.description}
                </Text>
              ) : null}

              {/* Stats row — member count + post count */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statCount}>{orgProfile.memberCount}</Text>
                  <Text style={styles.statLabel}>{t('members')}</Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <Text style={styles.statCount}>{orgProfile.postCount}</Text>
                  <Text style={styles.statLabel}>{t('posts')}</Text>
                </View>
              </View>

              {/* Join / Leave button — shown for all authenticated viewers */}
              {showJoinLeave && (
                <JoinLeaveButton
                  orgId={orgId}
                  membershipStatus={orgProfile.membershipStatus}
                  isPrivate={isPrivate}
                />
              )}
            </View>

            {/* ── Animated tab bar ────────────────────────────────────────── */}
            <View style={styles.tabBar}>
              <View style={styles.tabRow}>
                {TABS.map((tab, index) => (
                  <TabButton
                    key={tab.key}
                    label={tab.label}
                    isActive={activeIndex === index}
                    onPress={() => handleTabPress(index)}
                    onLayout={makeOnLayout(index)}
                  />
                ))}
              </View>

              {/* Animated underline sits beneath the tab row, inside the same
                  container so its translateX origin aligns with the tab row's
                  coordinate space. */}
              <View style={styles.indicatorTrack}>
                <TabIndicator translateX={translateX} indicatorWidth={indicatorWidth} />
              </View>

              {/* Separator line beneath the entire tab bar */}
              <View style={styles.tabBarBorder} />
            </View>
          </View>
        }
        ListFooterComponent={
          <View>
            {/* ── Tab content — only the active tab is rendered ───────────── */}
            {activeIndex === 0 && <PostsTab orgId={orgId} />}
            {activeIndex === 1 && <MembersTab orgId={orgId} />}
            {activeIndex === 2 && <ChaptersTab orgId={orgId} />}
          </View>
        }
        keyExtractor={() => 'org-profile-layout'}
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
  list: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── Org header ──────────────────────────────────────────────────────────────

  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.void,
  },
  orgName: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  orgHandle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  typeBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#1a1a1a',
  },
  typeBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  parentOrgLink: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  parentOrgName: {
    color: colors.signal,
    fontFamily: typography.fontFamily.semiBold,
  },
  description: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Stats row ───────────────────────────────────────────────────────────────

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  statCount: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  statLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.border,
  },

  // ── Join / Leave button ─────────────────────────────────────────────────────

  joinButton: {
    marginTop: spacing.lg,
    height: 36,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  joinButtonJoin: {
    backgroundColor: colors.signal,
  },
  joinButtonLeave: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  joinButtonDisabled: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  joinButtonLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
  },
  joinButtonLabelJoin: {
    color: colors.void,
  },
  joinButtonLabelLeave: {
    color: colors.paper,
  },
  joinButtonLabelMuted: {
    color: colors.muted,
  },

  // ── Tab bar — identical structure to ProfileScreen ─────────────────────────

  tabBar: {
    backgroundColor: colors.void,
  },
  tabRow: {
    flexDirection: 'row',
    // Distribute tabs evenly across the full screen width
    width: SCREEN_WIDTH,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  tabLabel: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
  },
  tabLabelActive: {
    color: colors.paper,
  },
  tabLabelInactive: {
    color: colors.muted,
  },

  // ── Animated indicator ──────────────────────────────────────────────────────

  indicatorTrack: {
    // Zero-height container so the indicator does not push content down
    height: 2,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    backgroundColor: colors.signal,
    borderRadius: 1,
  },

  // ── Thin border beneath full tab bar ───────────────────────────────────────

  tabBarBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Members tab rows ────────────────────────────────────────────────────────

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  memberDisplayName: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  memberUsername: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#1a1a1a',
  },
  roleBadgeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },
  memberSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 56 + spacing.sm + spacing.md, // avatar width + gap + horizontal padding
  },

  // ── Loading / empty states ──────────────────────────────────────────────────

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  emptyStateText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    textAlign: 'center',
  },
})

export default OrgProfileScreen
