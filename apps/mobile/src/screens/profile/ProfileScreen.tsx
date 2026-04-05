/**
 * ProfileScreen — full profile with animated tab bar (Posts | Followers | Following).
 *
 * Supports two modes:
 *   1. Own profile — no route param; fetches the authenticated user's data.
 *   2. Other user's profile — pass `userId` route param; fetches that user's data,
 *      shows a Message button alongside the Follow button.
 *
 * Tab indicator: animated underline in colors.signal (#4CD964)
 * Follows the exact same animated tab pattern as FeedScreen.tsx.
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
import { useNavigation, useRoute, useNavigationState } from '@react-navigation/native'
import { useFocusEffect } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { useLanguage } from '../../i18n/LanguageContext'
import type { TranslationKey } from '../../i18n/translations'
import { Avatar } from '../../components/ui/Avatar'
import { PostCard } from '../../components/ui/PostCard'
import { UserCard } from '../../components/ui/UserCard'
import { FollowButton } from '../../components/ui/FollowButton'
import { colors, typography, spacing } from '../../theme/tokens'
import type { PostWithDetails, UserSummary, FollowStats } from '@portal/types'

// ---------------------------------------------------------------------------
// Navigation types
// ---------------------------------------------------------------------------

type ProfileStackParamList = {
  /** userId: whose profile to show (omit for own profile).
   *  displayName: passed-through for use in navigation calls where it's needed. */
  ProfileRoot: { userId?: string; displayName?: string } | undefined
  // Conversation lives in the Messages stack; we navigate cross-stack via
  // the root AppTabParamList → Messages tab → Conversation screen.
  // We use a type-unsafe navigate call here to avoid a circular import.
  /** Edit the authenticated user's own profile. */
  EditProfile: undefined
  /** App settings screen. */
  Settings: undefined
}

type ProfileRouteProp = RouteProp<ProfileStackParamList, 'ProfileRoot'>

// Minimal cross-stack navigation shape — enough to reach the Messages tab.
// Using `any` here is intentional: the full cross-stack type would require
// importing AppTabParamList which creates a circular dep chain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppNavProp = NativeStackNavigationProp<any>

// ---------------------------------------------------------------------------
// API response shapes (local to this screen)
// ---------------------------------------------------------------------------

interface CreateConversationResponse {
  conversationId: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width

/** Duration for the underline slide animation in milliseconds. */
const INDICATOR_ANIMATION_MS = 200

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

type TabKey = 'posts' | 'followers' | 'following'

interface TabConfig {
  key: TabKey
  label: string
}

const TABS: TabConfig[] = [
  { key: 'posts', label: 'posts' },
  { key: 'followers', label: 'followers' },
  { key: 'following', label: 'following' },
]

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface PostsPage {
  posts: PostWithDetails[]
  nextCursor: string | null
  hasMore: boolean
  total?: number
}

interface UsersPage {
  users: UserSummary[]
  nextCursor: string | null
  hasMore: boolean
}

interface FollowStatsResponse {
  followStats: FollowStats
}

// ---------------------------------------------------------------------------
// Animated underline indicator — identical to FeedScreen pattern
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
// Individual tab button — identical to FeedScreen pattern
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
// Stat item — tappable column in the stats row
// ---------------------------------------------------------------------------

interface StatItemProps {
  label: string
  count: number
  onPress: () => void
}

function StatItem({ label, count, onPress }: StatItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.statItem}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}`}
    >
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
// No-op PostCard navigation — navigation to PostDetail wired in a future sprint
// ---------------------------------------------------------------------------

const noOpNavigation = {
  navigateToPostDetail: (_postId: string) => {},
  navigateToUserProfile: (_userId: string) => {},
  navigateToOrgProfile: (_orgId: string) => {},
}

// ---------------------------------------------------------------------------
// Tab content components — separated to keep ProfileScreen render lean
// ---------------------------------------------------------------------------

interface PostsTabProps {
  userId: string
}

function PostsTab({ userId }: PostsTabProps) {
  const { t } = useLanguage()
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['profile-posts', userId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<PostsPage>(`/users/${userId}/posts${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const posts = data?.pages.flatMap((page) => page.posts) ?? []

  const renderItem: ListRenderItem<PostWithDetails> = useCallback(
    ({ item }) => (
      <PostCard
        post={item}
        navigation={noOpNavigation}
      />
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

interface UsersTabProps {
  userId: string
  type: 'followers' | 'following'
}

function UsersTab({ userId, type }: UsersTabProps) {
  const { t } = useLanguage()
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: [type, userId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<UsersPage>(`/users/${userId}/${type}${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const users = data?.pages.flatMap((page) => page.users) ?? []

  const renderItem: ListRenderItem<UserSummary> = useCallback(
    ({ item }) => <UserCard user={item} onPress={() => {}} />,
    [],
  )

  const keyExtractor = useCallback((item: UserSummary) => item.id, [])

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const emptyMessage =
    type === 'followers' ? t('noFollowersYet') : t('noFollowingYet')

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.signal} />
      </View>
    )
  }

  return (
    <FlatList
      data={users}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      scrollEnabled={false}
      ListEmptyComponent={<EmptyState message={emptyMessage} />}
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
// ProfileScreen
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const { t } = useLanguage()
  const currentUser = useAuthStore((s) => s.user)
  // useNavigation typed as `any` to allow cross-stack navigation to the Messages tab
  // without importing the full AppTabParamList (which would create a circular dep).
  const navigation = useNavigation<AppNavProp>()

  // Optional route param — when present, show another user's profile.
  // When absent (own Profile tab), show the authenticated user's own profile.
  const route = useRoute<ProfileRouteProp>()
  const routeUserId = route.params?.userId
  // Optional pre-supplied display name from the caller (e.g. a user card that
  // already has the name). Used as the ConversationScreen header title.
  const routeDisplayName = route.params?.displayName

  // Determine which user's profile to display:
  //   - routeUserId present → viewing someone else's profile
  //   - routeUserId absent  → viewing own profile
  const profileUserId = routeUserId ?? currentUser?.id ?? ''
  const isOwnProfile = !routeUserId || routeUserId === currentUser?.id

  // Show a back button when this screen was pushed on a stack (e.g. from Explore)
  // rather than being the root of the Profile tab.
  const canGoBack = useNavigationState((state) => state.index > 0)

  const [activeIndex, setActiveIndex] = useState(0)

  // Shared values powering the indicator animation — driven by tab widths
  // measured via onLayout so the indicator tracks the actual rendered label.
  const translateX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)

  // Store tab x-offsets and widths measured from the tab bar layout.
  // Using a plain ref array avoids unnecessary re-renders on measurement.
  const tabOffsets = useRef<number[]>([0, 0, 0])
  const tabWidths = useRef<number[]>([0, 0, 0])

  // Fetch the other user's profile when not viewing own profile.
  // Own profile comes from the auth store and is always up to date.
  const { data: otherUserData, isLoading: isLoadingOtherUser } = useQuery({
    queryKey: ['user-profile', profileUserId],
    queryFn: () => api.get<{ user: { displayName: string; username: string; bio: string | null; avatarUrl: string | null } }>(`/users/${encodeURIComponent(profileUserId)}`),
    enabled: !isOwnProfile && !!profileUserId,
  })

  // Fetch follow stats: { followStats: { followersCount, followingCount, isFollowing } }
  const { data: followStatsData, refetch: refetchFollowStats } = useQuery({
    queryKey: ['follow-stats', profileUserId],
    queryFn: () =>
      api.get<FollowStatsResponse>(`/users/${profileUserId}/follow-stats`),
    enabled: !!profileUserId,
  })

  // Refetch stats whenever this screen comes into focus so counts are
  // always up to date after following/unfollowing elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      if (profileUserId) refetchFollowStats()
    }, [profileUserId, refetchFollowStats]),
  )

  // Fetch the first page of user posts to get the total count if available.
  const { data: postsData } = useInfiniteQuery({
    queryKey: ['profile-posts', profileUserId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<PostsPage>(`/users/${profileUserId}/posts${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!profileUserId,
  })

  const followersCount = followStatsData?.followStats.followersCount ?? 0
  const followingCount = followStatsData?.followStats.followingCount ?? 0
  // Use total field from first page if the server returns it, otherwise
  // count what has been fetched so far (conservative display while loading).
  const postsCount = postsData?.pages[0]?.total ?? postsData?.pages.flatMap((p) => p.posts).length ?? 0

  // --------------------------------------------------------------------------
  // Message button — creates/opens a DM conversation with the profile user
  // --------------------------------------------------------------------------

  const { mutate: openConversation, isPending: isOpeningConversation } = useMutation({
    mutationFn: () =>
      api.post<CreateConversationResponse>('/conversations', {
        otherUserId: profileUserId,
      }),
    onSuccess: ({ conversationId }) => {
      // Navigate cross-stack to the Messages tab → Conversation screen.
      // The `navigate` call uses a nested route descriptor supported by
      // React Navigation's cross-navigator navigation API.
      navigation.navigate('Messages', {
        screen: 'Conversation',
        params: {
          conversationId,
          otherUserId: profileUserId,
          // Use the display name passed via route params when available;
          // fall back to the profileUserId string as a last resort.
          otherDisplayName: routeDisplayName ?? profileUserId,
        },
      })
    },
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
  // Render — resolve the display user (own or other)
  // --------------------------------------------------------------------------

  if (!currentUser || (!isOwnProfile && isLoadingOtherUser)) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.signal} />
        </View>
      </View>
    )
  }

  const avatarUri = isOwnProfile ? (currentUser.avatarUrl ?? null) : (otherUserData?.user.avatarUrl ?? null)
  const displayName = isOwnProfile ? (currentUser.displayName ?? '') : (otherUserData?.user.displayName ?? '')
  const username = isOwnProfile ? (currentUser.username ?? '') : (otherUserData?.user.username ?? '')
  const bio = isOwnProfile ? (currentUser.bio ?? null) : (otherUserData?.user.bio ?? null)

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
    <FlatList
      data={[]}
      renderItem={null}
      style={styles.list}
      contentContainerStyle={styles.scrollContent}
      ListHeaderComponent={
        <View>
          {/* ── Back button — shown when pushed from another stack ───────── */}
          {canGoBack && (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft color={colors.paper} size={26} strokeWidth={1.75} />
            </TouchableOpacity>
          )}

          {/* ── Profile header ──────────────────────────────────────────── */}
          <View style={styles.header}>
            {/* Avatar */}
            <Avatar uri={avatarUri} name={displayName} size="xl" />

            {/* Display name */}
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>

            {/* @username — only shown when available */}
            {username ? (
              <Text style={styles.username} numberOfLines={1}>
                @{username}
              </Text>
            ) : null}

            {/* Bio — only rendered when present */}
            {bio ? (
              <Text style={styles.bio} numberOfLines={3}>
                {bio}
              </Text>
            ) : null}

            {/* Stats row — each stat taps to the corresponding tab */}
            <View style={styles.statsRow}>
              <StatItem
                label={t('posts')}
                count={postsCount}
                onPress={() => handleTabPress(0)}
              />

              <View style={styles.statDivider} />

              <StatItem
                label={t('followers')}
                count={followersCount}
                onPress={() => handleTabPress(1)}
              />

              <View style={styles.statDivider} />

              <StatItem
                label={t('following')}
                count={followingCount}
                onPress={() => handleTabPress(2)}
              />
            </View>

            {/* ── Action buttons row (Follow + Message) — hidden on own profile ── */}
            {!isOwnProfile && (
              <View style={styles.actionsRow}>
                <FollowButton
                  userId={profileUserId}
                  initialIsFollowing={followStatsData?.followStats.isFollowing ?? false}
                />
                <TouchableOpacity
                  onPress={() => openConversation()}
                  disabled={isOpeningConversation}
                  activeOpacity={0.8}
                  style={[
                    styles.actionButton,
                    isOpeningConversation && styles.actionButtonDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Send a message"
                >
                  {isOpeningConversation ? (
                    <ActivityIndicator size="small" color={colors.paper} />
                  ) : (
                    <Text style={styles.actionButtonText}>{t('sendMessage')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── Edit profile button — only visible on own profile ── */}
            {isOwnProfile && (
              <TouchableOpacity
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.7}
                style={styles.editProfileButton}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Text style={styles.editProfileButtonText}>{t('editProfile')}</Text>
              </TouchableOpacity>
            )}

            {/* ── Settings row — only visible on own profile ── */}
            {isOwnProfile && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Settings')}
                activeOpacity={0.7}
                style={styles.settingsRow}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Text style={styles.settingsIcon}>⚙</Text>
                <Text style={styles.settingsLabel}>{t('settings')}</Text>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Animated tab bar ────────────────────────────────────────── */}
          <View style={styles.tabBar}>
            <View style={styles.tabRow}>
              {TABS.map((tab, index) => (
                <TabButton
                  key={tab.key}
                  label={t(tab.label as TranslationKey)}
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
          {activeIndex === 0 && <PostsTab userId={profileUserId} />}
          {activeIndex === 1 && <UsersTab userId={profileUserId} type="followers" />}
          {activeIndex === 2 && <UsersTab userId={profileUserId} type="following" />}
        </View>
      }
      keyExtractor={() => 'profile-layout'}
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

  // ── Back button ────────────────────────────────────────────────────────────

  backBtn: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    alignSelf: 'flex-start',
  },

  // ── Profile header ─────────────────────────────────────────────────────────

  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.void,
  },
  displayName: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  username: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  bio: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Stats row ──────────────────────────────────────────────────────────────

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

  // ── Action buttons row (Message, Follow) ──────────────────────────────────

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  // Outlined pill — matches the height of FollowButton's pill style
  actionButton: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },

  // ── Edit profile button ────────────────────────────────────────────────────

  editProfileButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
  },
  editProfileButtonText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.signal,
  },

  // ── Settings row ───────────────────────────────────────────────────────────

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  settingsIcon: {
    fontSize: typography.sizes.base,
    color: colors.muted,
  },
  settingsLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.muted,
    flex: 1,
  },
  settingsChevron: {
    fontSize: typography.sizes.lg,
    color: colors.muted,
    lineHeight: typography.sizes.lg + 2,
  },

  // ── Tab bar — identical structure to FeedScreen ────────────────────────────

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
    // #F5F5F3 — colors.paper
    color: colors.paper,
  },
  tabLabelInactive: {
    // #6B6B6B — colors.muted
    color: colors.muted,
  },

  // ── Animated indicator ─────────────────────────────────────────────────────

  indicatorTrack: {
    // Zero-height container so the indicator does not push content down;
    // the indicator itself has a defined height.
    height: 2,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    // #4CD964 — colors.signal
    backgroundColor: colors.signal,
    borderRadius: 1,
  },

  // ── Thin border beneath full tab bar ──────────────────────────────────────

  tabBarBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Loading / empty states ─────────────────────────────────────────────────

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

export default ProfileScreen
