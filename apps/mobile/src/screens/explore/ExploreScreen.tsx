/**
 * ExploreScreen — search bar with People / Posts / Orgs result tabs.
 *
 * The search input is debounced 400 ms before the query triggers React Query
 * fetches. While the query string is empty a centered placeholder is shown
 * instead of the tab bar. Each tab fetches from the /search endpoint and
 * renders the relevant card list with an ActivityIndicator while loading and
 * an EmptyState when no results are found.
 *
 * Tab indicator: animated underline in colors.signal — pattern copied exactly
 * from FeedScreen so the two screens are visually consistent.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useQuery } from '@tanstack/react-query'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { UserSummary, PostWithDetails, OrgSummary, SearchResults } from '@portal/types'
import type { TranslationKey } from '../../i18n/translations'
import { api } from '../../services/api'
import { UserCard } from '../../components/ui/UserCard'
import { PostCard } from '../../components/ui/PostCard'
import { OrgCard } from '../../components/ui/OrgCard'
import { EmptyState } from '../../components/ui/EmptyState'
import { colors, typography, spacing } from '../../theme/tokens'
import type { ExploreStackParamList } from '../../navigation/AppNavigator'
import { useLanguage } from '../../i18n/LanguageContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width

/** Duration for the underline slide animation in milliseconds. */
const INDICATOR_ANIMATION_MS = 200

/** Debounce delay before the search query triggers a network request. */
const DEBOUNCE_MS = 400

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

type SearchTab = 'people' | 'posts' | 'orgs'

interface TabConfig {
  key: SearchTab
  label: string
}

const TABS: TabConfig[] = [
  { key: 'people', label: 'explorePeople' },
  { key: 'posts', label: 'posts' },
  { key: 'orgs', label: 'exploreOrgs' },
]

// ---------------------------------------------------------------------------
// Animated underline indicator — same implementation as FeedScreen
// ---------------------------------------------------------------------------

interface IndicatorProps {
  translateX: Animated.SharedValue<number>
  indicatorWidth: Animated.SharedValue<number>
}

/**
 * Thin underline that slides horizontally to sit beneath the active tab.
 * Width matches the active tab's measured width for a tight fit.
 */
function TabIndicator({ translateX, indicatorWidth }: IndicatorProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth.value,
  }))

  return <Animated.View style={[styles.indicator, animatedStyle]} />
}

// ---------------------------------------------------------------------------
// Individual tab button — same implementation as FeedScreen
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
// Separator for FlatLists (People / Orgs tabs use a hairline border)
// ---------------------------------------------------------------------------

function ItemSeparator() {
  return <View style={styles.separator} />
}


// ---------------------------------------------------------------------------
// Navigation prop type for the Explore stack
// ---------------------------------------------------------------------------

interface ExploreScreenProps {
  navigation: StackNavigationProp<ExploreStackParamList, 'ExploreRoot'>
}

// ---------------------------------------------------------------------------
// ExploreScreen
// ---------------------------------------------------------------------------

export function ExploreScreen({ navigation }: ExploreScreenProps) {
  const { t } = useLanguage()

  // --- Search state ---
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  // Debounce: update debouncedQuery 400 ms after the user stops typing.
  // The cleanup cancels the pending timer when query changes again before it fires.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // --- Animated tab indicator (same shared-value pattern as FeedScreen) ---
  const translateX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)

  // Store tab x-offsets and widths measured via onLayout. Plain ref to avoid
  // re-renders on measurement (same approach as FeedScreen).
  const tabOffsets = useRef<number[]>([0, 0, 0])
  const tabWidths = useRef<number[]>([0, 0, 0])

  const makeOnLayout = useCallback(
    (index: number) =>
      (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout
        tabOffsets.current[index] = x
        tabWidths.current[index] = width

        // Initialise the indicator under the first tab on first render.
        if (index === 0) {
          indicatorWidth.value = width
          translateX.value = x
        }
      },
    [indicatorWidth, translateX],
  )

  const handleTabPress = useCallback(
    (index: number) => {
      setActiveIndex(index)
      const timing = { duration: INDICATOR_ANIMATION_MS, easing: Easing.out(Easing.quad) }
      translateX.value = withTiming(tabOffsets.current[index], timing)
      indicatorWidth.value = withTiming(tabWidths.current[index], timing)
    },
    [translateX, indicatorWidth],
  )

  // --- Data fetching — one query per tab, only when debounced query is set ---

  const isQueryActive = debouncedQuery.length > 0

  const usersQuery = useQuery({
    queryKey: ['search', 'users', debouncedQuery],
    queryFn: () =>
      api.get<SearchResults>(
        `/search?q=${encodeURIComponent(debouncedQuery)}&type=users`,
      ),
    enabled: isQueryActive,
  })

  const postsQuery = useQuery({
    queryKey: ['search', 'posts', debouncedQuery],
    queryFn: () =>
      api.get<SearchResults>(
        `/search?q=${encodeURIComponent(debouncedQuery)}&type=posts`,
      ),
    enabled: isQueryActive,
  })

  const orgsQuery = useQuery({
    queryKey: ['search', 'orgs', debouncedQuery],
    queryFn: () =>
      api.get<SearchResults>(
        `/search?q=${encodeURIComponent(debouncedQuery)}&type=orgs`,
      ),
    enabled: isQueryActive,
  })

  const users: UserSummary[] = usersQuery.data?.users ?? []
  const posts: PostWithDetails[] = postsQuery.data?.posts ?? []
  const orgs: OrgSummary[] = orgsQuery.data?.orgs ?? []

  // ---------------------------------------------------------------------------
  // Render helpers for each tab's content
  // ---------------------------------------------------------------------------

  function renderPeopleTab() {
    if (usersQuery.isLoading) {
      return <ActivityIndicator style={styles.loader} color={colors.signal} />
    }
    if (users.length === 0) {
      return (
        <EmptyState
          icon={<Text style={styles.emptyIcon}>🔍</Text>}
          title={t('noResultsFound')}
          subtitle={`No people matched "${debouncedQuery}"`}
        />
      )
    }
    return (
      <FlatList<UserSummary>
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: ListRenderItemInfo<UserSummary>) => (
          <UserCard
            user={item}
            onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          />
        )}
        ItemSeparatorComponent={ItemSeparator}
        keyboardShouldPersistTaps="handled"
      />
    )
  }

  function renderPostsTab() {
    if (postsQuery.isLoading) {
      return <ActivityIndicator style={styles.loader} color={colors.signal} />
    }
    if (posts.length === 0) {
      return (
        <EmptyState
          icon={<Text style={styles.emptyIcon}>🔍</Text>}
          title={t('noResultsFound')}
          subtitle={`No posts matched "${debouncedQuery}"`}
        />
      )
    }
    return (
      <FlatList<PostWithDetails>
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: ListRenderItemInfo<PostWithDetails>) => (
          <PostCard
            post={item}
            navigation={{
              navigateToPostDetail: (postId) => (navigation as any).navigate('PostDetail', { postId }),
              navigateToUserProfile: (userId) => navigation.navigate('UserProfile', { userId }),
              navigateToOrgProfile: (orgId) => navigation.navigate('OrgProfile', { orgId }),
            }}
          />
        )}
        keyboardShouldPersistTaps="handled"
      />
    )
  }

  function renderOrgsTab() {
    if (orgsQuery.isLoading) {
      return <ActivityIndicator style={styles.loader} color={colors.signal} />
    }
    if (orgs.length === 0) {
      return (
        <EmptyState
          icon={<Text style={styles.emptyIcon}>🔍</Text>}
          title={t('noResultsFound')}
          subtitle={`No organisations matched "${debouncedQuery}"`}
        />
      )
    }
    return (
      <FlatList<OrgSummary>
        data={orgs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: ListRenderItemInfo<OrgSummary>) => (
          <OrgCard
            org={item}
            onPress={() => navigation.navigate('OrgProfile', { orgId: item.id })}
          />
        )}
        ItemSeparatorComponent={ItemSeparator}
        keyboardShouldPersistTaps="handled"
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Search bar section ──────────────────────────────────────────────── */}
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityLabel="Search input"
          />

          {/* Clear button — only visible when query is non-empty */}
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('')
                setDebouncedQuery('')
              }}
              activeOpacity={0.7}
              style={styles.clearButton}
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Tab bar — only visible when query is non-empty ──────────────────── */}
      {query.length > 0 && (
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

          {/* Animated underline sits beneath the tab row */}
          <View style={styles.indicatorTrack}>
            <TabIndicator translateX={translateX} indicatorWidth={indicatorWidth} />
          </View>

          {/* Full-width separator beneath the tab bar */}
          <View style={styles.tabBarBorder} />
        </View>
      )}

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <View style={styles.content}>
        {/* Empty query: show placeholder */}
        {!isQueryActive && (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              {t('searchPrompt')}
            </Text>
          </View>
        )}

        {/* Active query: show results for the active tab */}
        {isQueryActive && activeIndex === 0 && renderPeopleTab()}
        {isQueryActive && activeIndex === 1 && renderPostsTab()}
        {isQueryActive && activeIndex === 2 && renderOrgsTab()}
      </View>
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

  // ── Search bar section ──────────────────────────────────────────────────────

  searchSection: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.void,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    // '#111' is the only hardcoded color in this file per spec
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    flex: 1,
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
  },
  clearButton: {
    marginLeft: spacing.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.muted,
    fontSize: typography.sizes.xl,
    lineHeight: 24,
  },

  // ── Tab bar ─────────────────────────────────────────────────────────────────

  tabBar: {
    backgroundColor: colors.void,
  },
  tabRow: {
    flexDirection: 'row',
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

  // ── Animated indicator ───────────────────────────────────────────────────────

  indicatorTrack: {
    // Zero-height container — the indicator has its own defined height
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

  // ── Tab bar bottom border ───────────────────────────────────────────────────

  tabBarBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Content area ────────────────────────────────────────────────────────────

  content: {
    flex: 1,
  },

  // ── Empty query placeholder ─────────────────────────────────────────────────

  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    textAlign: 'center',
  },

  // ── Loading indicator ───────────────────────────────────────────────────────

  loader: {
    marginTop: spacing.xxxl,
  },

  // ── FlatList item separator ─────────────────────────────────────────────────

  separator: {
    height: 1,
    backgroundColor: colors.border,
  },

  // ── EmptyState icon ─────────────────────────────────────────────────────────

  emptyIcon: {
    fontSize: typography.sizes.xxl,
  },
})
