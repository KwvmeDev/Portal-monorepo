/**
 * VoteControls — upvote / downvote widget used inside PostCard and PostDetail.
 *
 * Layout:  ▲  [net score]  ▼
 *
 * Behaviour:
 *  - Tapping the active arrow removes the vote  (DELETE /api/posts/:id/vote)
 *  - Tapping the inactive arrow casts / switches the vote  (POST /api/posts/:id/vote)
 *  - State is updated optimistically; any API error reverts to the previous state.
 *  - A spring scale animation (1.0 → 1.3 → 1.0) plays on each tap via
 *    react-native-reanimated so the gesture feels snappy and immediate.
 */

import React, { useCallback } from 'react'
import { StyleSheet, Text, View, Pressable } from 'react-native'
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useMutation } from '@tanstack/react-query'
import type { VoteValue, VoteState } from '@portal/types'
import { api } from '../../services/api'
import { colors, typography, spacing } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoteControlsProps {
  postId: string
  initialUpvotes: number
  initialDownvotes: number
  /** The calling user's existing vote, or null if they have not voted. */
  initialUserVote: VoteValue | null
}

/**
 * Encapsulates the three pieces of mutable vote state so a single setState
 * call keeps them atomically in sync (avoids tearing on rapid taps).
 */
interface LocalVoteState {
  upvotes: number
  downvotes: number
  userVote: VoteValue | null
}

// ---------------------------------------------------------------------------
// Pure helpers — derive display values from LocalVoteState
// ---------------------------------------------------------------------------

/**
 * Compute the optimistic state that should apply immediately when the user
 * taps a direction, given the current state.
 *
 * Rules (mirror the server's voteService logic):
 *  - Tapping the active direction  → toggle off (remove vote)
 *  - Tapping the opposite direction → switch vote
 *  - Tapping with no existing vote  → cast new vote
 */
const computeOptimisticState = (
  current: LocalVoteState,
  tapped: VoteValue,
): LocalVoteState => {
  const { upvotes, downvotes, userVote } = current

  if (userVote === tapped) {
    // Toggle off
    return {
      upvotes: tapped === 'up' ? upvotes - 1 : upvotes,
      downvotes: tapped === 'down' ? downvotes - 1 : downvotes,
      userVote: null,
    }
  }

  if (userVote === null) {
    // New vote
    return {
      upvotes: tapped === 'up' ? upvotes + 1 : upvotes,
      downvotes: tapped === 'down' ? downvotes + 1 : downvotes,
      userVote: tapped,
    }
  }

  // Switch vote (userVote is the opposite direction)
  return {
    upvotes: tapped === 'up' ? upvotes + 1 : upvotes - 1,
    downvotes: tapped === 'down' ? downvotes + 1 : downvotes - 1,
    userVote: tapped,
  }
}

// ---------------------------------------------------------------------------
// Arrow sub-component
// ---------------------------------------------------------------------------

interface ArrowButtonProps {
  direction: VoteValue
  isActive: boolean
  onPress: () => void
  animatedStyle: ReturnType<typeof useAnimatedStyle>
}

/**
 * Renders a single arrow (▲ or ▼) that is visually filled when active.
 *
 * The Unicode filled/outline characters give a clean appearance without
 * requiring react-native-svg.  Active = filled triangle, inactive = outline.
 *
 * Filled characters:  ▲ (U+25B2) up, ▼ (U+25BC) down
 * Outline characters: △ (U+25B3) up, ▽ (U+25BD) down
 */
const ArrowButton = React.memo(
  ({ direction, isActive, onPress, animatedStyle }: ArrowButtonProps) => {
    const isUp = direction === 'up'
    const activeColor = isUp ? colors.upvote : colors.downvote

    // Filled vs outline triangle glyphs
    const glyph = isUp
      ? isActive ? '▲' : '△'
      : isActive ? '▼' : '▽'

    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={isUp ? 'Upvote' : 'Downvote'}
        accessibilityState={{ selected: isActive }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Animated.View style={[styles.arrowWrapper, animatedStyle]}>
          <Text
            style={[
              styles.arrow,
              { color: isActive ? activeColor : colors.muted },
            ]}
          >
            {glyph}
          </Text>
        </Animated.View>
      </Pressable>
    )
  },
)

ArrowButton.displayName = 'ArrowButton'

// ---------------------------------------------------------------------------
// VoteControls
// ---------------------------------------------------------------------------

export function VoteControls({
  postId,
  initialUpvotes,
  initialDownvotes,
  initialUserVote,
}: VoteControlsProps) {
  // Local state — the source of truth for optimistic rendering
  const [voteState, setVoteState] = React.useState<LocalVoteState>({
    upvotes: initialUpvotes,
    downvotes: initialDownvotes,
    userVote: initialUserVote,
  })

  // Reanimated shared values — one scale per arrow so they animate independently
  const upScale = useSharedValue(1)
  const downScale = useSharedValue(1)

  // Animated styles derived from shared values
  const upAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: upScale.value }],
  }))
  const downAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: downScale.value }],
  }))

  /**
   * Fires the scale animation for the tapped arrow:
   * spring to 1.3, then spring back to 1.0 for a bouncy feel.
   */
  const playScaleAnimation = useCallback(
    (scale: SharedValue<number>) => {
      // 1.0 → 1.3 (fast spring up) → 1.0 (spring back)
      scale.value = withSequence(
        withSpring(1.3, { damping: 4, stiffness: 300 }),
        withTiming(1.0, { duration: 180 }),
      )
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Mutation: POST /api/posts/:id/vote — cast or switch vote
  // -------------------------------------------------------------------------
  const { mutate: castVote } = useMutation<VoteState, Error, VoteValue>({
    mutationFn: (value) =>
      api.post<VoteState>(`/posts/${postId}/vote`, { value }),
    // On error, revert to the snapshot stored in context
    onError: (_err, _value, context) => {
      if (context !== undefined) {
        setVoteState(context as LocalVoteState)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Mutation: DELETE /api/posts/:id/vote — remove vote (toggle off)
  // -------------------------------------------------------------------------
  const { mutate: removeVote } = useMutation<VoteState, Error, void>({
    mutationFn: () => api.del<VoteState>(`/posts/${postId}/vote`),
    onError: (_err, _value, context) => {
      if (context !== undefined) {
        setVoteState(context as LocalVoteState)
      }
    },
  })

  // -------------------------------------------------------------------------
  // Tap handler — shared by both arrows
  // -------------------------------------------------------------------------
  const handleVote = useCallback(
    (tapped: VoteValue) => {
      const snapshot = { ...voteState }
      const optimistic = computeOptimisticState(voteState, tapped)

      // 1. Animate the tapped arrow immediately
      playScaleAnimation(tapped === 'up' ? upScale : downScale)

      // 2. Apply optimistic update
      setVoteState(optimistic)

      // 3. Call the appropriate API, passing the snapshot so onError can revert
      if (voteState.userVote === tapped) {
        // Toggle off — remove vote
        removeVote(undefined, { onError: () => setVoteState(snapshot) })
      } else {
        // Cast new vote or switch direction
        castVote(tapped, { onError: () => setVoteState(snapshot) })
      }
    },
    [voteState, castVote, removeVote, playScaleAnimation, upScale, downScale],
  )

  const handleUpvote = useCallback(() => handleVote('up'), [handleVote])
  const handleDownvote = useCallback(() => handleVote('down'), [handleVote])

  return (
    <View style={styles.container}>
      <ArrowButton
        direction="up"
        isActive={voteState.userVote === 'up'}
        onPress={handleUpvote}
        animatedStyle={upAnimatedStyle}
      />
      <Text
        style={[
          styles.count,
          { color: voteState.userVote === 'up' ? colors.upvote : colors.muted },
        ]}
        accessibilityLabel={`${voteState.upvotes} upvotes`}
      >
        {voteState.upvotes}
      </Text>

      <ArrowButton
        direction="down"
        isActive={voteState.userVote === 'down'}
        onPress={handleDownvote}
        animatedStyle={downAnimatedStyle}
      />
      <Text
        style={[
          styles.count,
          { color: voteState.userVote === 'down' ? colors.downvote : colors.muted },
        ]}
        accessibilityLabel={`${voteState.downvotes} downvotes`}
      >
        {voteState.downvotes}
      </Text>
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
    gap: spacing.sm,
  },
  arrowWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: typography.sizes.lg,
    lineHeight: typography.sizes.lg + 4,
  },
  count: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    minWidth: 16,
  },
})

export default VoteControls
