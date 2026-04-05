import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { spacing, radius } from '../../theme/tokens'

// Shimmer color range defined by sprint spec: #181818 → #212121 (opacity pulse)
const SHIMMER_BASE = '#181818'
const SHIMMER_HIGHLIGHT = '#212121'
const SHIMMER_DURATION_MS = 900

/**
 * Single animated shimmer block.
 * Pulses opacity from the base surface color to the elevated surface color,
 * creating a subtle breathing effect that signals loading state.
 */
function ShimmerBlock({ style }: { style: object }) {
  const opacity = useSharedValue(0)

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, {
        duration: SHIMMER_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      // Repeat indefinitely, reversing direction so we get base → highlight → base
      -1,
      true,
    )
  }, [opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    // Interpolate between the two shimmer colors via opacity layering:
    // The base View holds SHIMMER_BASE; this animated overlay pulses from
    // opacity 0 (showing base) to opacity 1 (showing highlight).
    opacity: opacity.value,
  }))

  return (
    <View style={[styles.shimmerBase, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.shimmerHighlight, animatedStyle]} />
    </View>
  )
}

/**
 * PostCardSkeleton — mimics the PostCard layout:
 *  Row 1: avatar circle  + two short text lines (author + handle)
 *  Row 2: two content text lines (post body)
 *  Row 3: action row (vote + comment + repost + share placeholders)
 */
export function PostCardSkeleton() {
  return (
    <View style={styles.card}>
      {/* Author row */}
      <View style={styles.authorRow}>
        <ShimmerBlock style={styles.avatarCircle} />
        <View style={styles.authorTextGroup}>
          <ShimmerBlock style={styles.authorNameLine} />
          <ShimmerBlock style={styles.authorHandleLine} />
        </View>
      </View>

      {/* Content lines */}
      <ShimmerBlock style={styles.contentLineFull} />
      <ShimmerBlock style={styles.contentLineShort} />

      {/* Action row */}
      <View style={styles.actionRow}>
        <ShimmerBlock style={styles.actionPill} />
        <ShimmerBlock style={styles.actionPill} />
        <ShimmerBlock style={styles.actionPill} />
        <ShimmerBlock style={styles.actionPill} />
      </View>
    </View>
  )
}

/**
 * FeedSkeleton — renders 5 stacked PostCardSkeletons.
 * Shown during the initial feed load before any posts are available.
 */
export function FeedSkeleton() {
  return (
    <View>
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </View>
  )
}

const styles = StyleSheet.create({
  // Card container matching PostCard padding/border conventions
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  authorTextGroup: {
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  authorNameLine: {
    width: 120,
    height: 12,
    borderRadius: radius.sm,
  },
  authorHandleLine: {
    width: 80,
    height: 10,
    borderRadius: radius.sm,
  },

  // Content lines
  contentLineFull: {
    width: '100%',
    height: 12,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  contentLineShort: {
    width: '65%',
    height: 12,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },

  // Action row — four equal-width pill placeholders
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionPill: {
    width: 48,
    height: 20,
    borderRadius: radius.pill,
  },

  // Shimmer rendering — base layer + highlight overlay
  shimmerBase: {
    backgroundColor: SHIMMER_BASE,
    overflow: 'hidden',
  },
  shimmerHighlight: {
    backgroundColor: SHIMMER_HIGHLIGHT,
  },
})
