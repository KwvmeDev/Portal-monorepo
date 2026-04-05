/**
 * FollowButton — follow/unfollow toggle for a user profile.
 *
 * - Renders nothing if the viewer is unauthenticated or is viewing their own profile.
 * - Optimistic update: state flips immediately on tap; reverts on API error.
 * - Visual states: outlined pill (not following) | filled pill (following) | spinner (in-flight).
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { colors, typography } from '../../theme/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowButtonProps {
  userId: string
  initialIsFollowing: boolean
  onFollowChange?: (isFollowing: boolean) => void
}

// ---------------------------------------------------------------------------
// FollowButton
// ---------------------------------------------------------------------------

export function FollowButton({
  userId,
  initialIsFollowing,
  onFollowChange,
}: FollowButtonProps) {
  // All hooks must be called unconditionally — guard is applied in the return.
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)

  // Sync local state when the prop updates (e.g. after followStats query loads).
  // useState only uses the initial value on first render, so subsequent prop
  // changes would be lost without this effect.
  useEffect(() => {
    setIsFollowing(initialIsFollowing)
  }, [initialIsFollowing])

  // Keep a ref to the current isFollowing value so mutationFn always reads the
  // pre-flip value even after onMutate has scheduled a state update.
  const isFollowingRef = useRef(isFollowing)
  useEffect(() => {
    isFollowingRef.current = isFollowing
  }, [isFollowing])

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const currentlyFollowing = isFollowingRef.current
      return currentlyFollowing
        ? api.del(`/users/${userId}/follow`)
        : api.post(`/users/${userId}/follow`)
    },

    // Optimistically flip local state before the request resolves.
    onMutate: () => {
      setIsFollowing((prev) => !prev)
    },

    // Revert the optimistic flip on error.
    onError: (err) => {
      setIsFollowing((prev) => !prev)
      console.error('[FollowButton] error:', err)
    },

    onSuccess: () => {
      const newValue = !isFollowingRef.current
      onFollowChange?.(newValue)
      // Invalidate all follow-stats: the followed user's follower count AND
      // the current viewer's following count both change on follow/unfollow.
      queryClient.invalidateQueries({ queryKey: ['follow-stats'] })
    },
  })

  // Do not render for unauthenticated viewers or the user's own profile.
  if (!currentUser || userId === currentUser.id) {
    return null
  }

  const handlePress = () => {
    if (!isPending) {
      mutate()
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={isPending}
      activeOpacity={0.8}
      style={[
        styles.pill,
        isFollowing ? styles.pillFilled : styles.pillOutlined,
      ]}
      accessibilityRole="button"
      accessibilityLabel={isFollowing ? 'Unfollow' : 'Follow'}
      accessibilityState={{ selected: isFollowing }}
    >
      {isPending ? (
        <ActivityIndicator size="small" color={colors.signal} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: isFollowing ? colors.void : colors.signal },
          ]}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      )}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  pill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOutlined: {
    borderWidth: 1.5,
    borderColor: colors.signal,
    backgroundColor: 'transparent',
  },
  pillFilled: {
    backgroundColor: colors.signal,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semiBold,
  },
})

export default FollowButton
