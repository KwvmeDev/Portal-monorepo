/**
 * FeedScreen — three-tab feed (Global | Campus | Org).
 *
 * Renders an inline custom tab bar with an animated underline indicator
 * driven by react-native-reanimated. This is NOT a React Navigation tab
 * navigator — the tabs live entirely within this single screen, keeping the
 * bottom navigation bar unaffected.
 *
 * Tab indicator: animated underline in #4CD964 (colors.signal)
 * Active tab text: #F5F5F3 (colors.paper)
 * Inactive tab text: #6B6B6B (colors.muted)
 */
import React, { useCallback, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Menu } from 'lucide-react-native'
import { colors, typography, spacing } from '../../theme/tokens'
import { FeedList } from '../../components/feed/FeedList'
import { useDrawer } from '../../i18n/DrawerContext'
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

type TabKey = 'global' | 'campus' | 'org'

interface TabConfig {
  key: TabKey
  label: string
}

const TABS: TabConfig[] = [
  { key: 'global', label: 'Global' },
  { key: 'campus', label: 'Campus' },
  { key: 'org', label: 'Org' },
]

// ---------------------------------------------------------------------------
// Animated underline indicator
// ---------------------------------------------------------------------------

interface IndicatorProps {
  /** Current translateX value (shared value, updated by FeedScreen). */
  translateX: Animated.SharedValue<number>
  /** Width of the indicator bar derived from measured tab widths. */
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
// Individual tab button
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
// FeedScreen
// ---------------------------------------------------------------------------

export function FeedScreen() {
  const { top } = useSafeAreaInsets()
  const [activeIndex, setActiveIndex] = useState(0)
  const { openDrawer } = useDrawer()
  const { t } = useLanguage()

  const tabLabels: Record<TabKey, string> = {
    global: t('feedGlobal'),
    campus: t('feedCampus'),
    org: t('feedOrg'),
  }

  // Shared values powering the indicator animation — driven by tab widths
  // measured via onLayout so the indicator tracks the actual rendered label.
  const translateX = useSharedValue(0)
  const indicatorWidth = useSharedValue(0)

  // Store tab x-offsets and widths measured from the tab bar layout.
  // Using a plain ref array avoids unnecessary re-renders on measurement.
  const tabOffsets = useRef<number[]>([0, 0, 0])
  const tabWidths = useRef<number[]>([0, 0, 0])

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
  // Render
  // --------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* ── Header row — hamburger menu above the tabs ───────────────────── */}
      <View style={[styles.header, { paddingTop: top }]}>
        <TouchableOpacity
          onPress={openDrawer}
          activeOpacity={0.8}
          style={styles.menuBtn}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Menu color={colors.paper} size={24} strokeWidth={1.75} />
        </TouchableOpacity>
      </View>

      {/* ── Custom inline tab bar ─────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <View style={styles.tabRow}>
          {TABS.map((tab, index) => (
            <TabButton
              key={tab.key}
              label={tabLabels[tab.key]}
              isActive={activeIndex === index}
              onPress={() => handleTabPress(index)}
              onLayout={makeOnLayout(index)}
            />
          ))}
        </View>

        {/* Animated underline sits beneath the tab row, inside the same container
            so its translateX origin aligns with the tab row's coordinate space. */}
        <View style={styles.indicatorTrack}>
          <TabIndicator translateX={translateX} indicatorWidth={indicatorWidth} />
        </View>

        {/* Separator line beneath the entire tab bar */}
        <View style={styles.tabBarBorder} />
      </View>

      {/* ── Feed content — only the active tab's FeedList is mounted ─────── */}
      {/* Each tab is conditionally rendered to avoid mounting all three lists
          simultaneously on startup. The active list is always kept mounted so
          its scroll position is preserved when switching tabs. */}
      <View style={styles.feedContainer}>
        {activeIndex === 0 && <FeedList feedType="global" />}
        {activeIndex === 1 && <FeedList feedType="campus" />}
        {activeIndex === 2 && <FeedList feedType="org" />}
      </View>
    </View>
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

  // ── Header row (above tabs) ───────────────────────────────────────────────

  header: {
    backgroundColor: colors.void,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBtn: {
    padding: spacing.xs,
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────

  tabBar: {
    backgroundColor: colors.void,
    paddingHorizontal: spacing.md,
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
    // #F5F5F3 — colors.paper
    color: colors.paper,
  },
  tabLabelInactive: {
    // #6B6B6B — colors.muted
    color: colors.muted,
  },

  // ── Animated indicator ────────────────────────────────────────────────────

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

  // ── Thin border beneath full tab bar ─────────────────────────────────────

  tabBarBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Feed list area ────────────────────────────────────────────────────────

  feedContainer: {
    flex: 1,
  },
})
