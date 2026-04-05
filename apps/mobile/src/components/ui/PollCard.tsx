import React, { useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import type { Poll, PollOption } from '@portal/types'

interface PollCardProps {
  poll: Poll
  /** The optionId the current user has voted for, or null if not voted yet. */
  userVote: string | null
  /** Called when the user taps an option before voting. */
  onVote: (optionId: string) => void
}

// --- Pure helpers ---

function totalVotes(options: PollOption[]): number {
  return options.reduce((sum, opt) => sum + opt.voteCount, 0)
}

function votePercent(option: PollOption, total: number): number {
  if (total === 0) return 0
  return Math.round((option.voteCount / total) * 100)
}

function isExpired(endsAt: string): boolean {
  return new Date(endsAt) <= new Date()
}

function formatExpiry(endsAt: string): string {
  const end = new Date(endsAt)
  const now = new Date()

  if (end <= now) return 'Poll ended'

  const diffMs = end.getTime() - now.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return `${diffMins}m remaining`
  }
  if (diffHours < 24) return `${diffHours}h remaining`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d remaining`
}

function winningOptionId(options: PollOption[]): string | null {
  if (options.length === 0) return null
  return options.reduce((best, opt) => (opt.voteCount > best.voteCount ? opt : best)).id
}

// --- Sub-components ---

interface VotedOptionRowProps {
  option: PollOption
  percent: number
  isUserChoice: boolean
  isWinner: boolean
}

function VotedOptionRow({ option, percent, isUserChoice, isWinner }: VotedOptionRowProps) {
  const { theme } = useTheme()
  // Animate bar width from 0 → percent on mount
  const animatedWidth = useSharedValue(0)

  useEffect(() => {
    animatedWidth.value = withTiming(percent, {
      duration: 600,
      easing: Easing.out(Easing.quad),
    })
  }, [percent, animatedWidth])

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%` as `${number}%`,
  }))

  // User's choice uses signal green; winner (when expired) also green
  const barColor = isUserChoice || isWinner ? colors.signal : theme.border
  const labelColor = isUserChoice || isWinner ? colors.signal : theme.textPrimary

  return (
    <View style={styles.optionRow}>
      {/* Background track */}
      <View
        style={[
          styles.barTrack,
          { backgroundColor: theme.surfaceElevated },
        ]}
      >
        {/* Animated fill bar */}
        <Animated.View
          style={[styles.barFill, barStyle, { backgroundColor: barColor }]}
        />

        {/* Option text layered on top of bar */}
        <View style={styles.barContent}>
          <Text
            style={[styles.optionText, { color: labelColor }]}
            numberOfLines={2}
          >
            {option.text}
          </Text>
          <Text style={[styles.percentText, { color: labelColor }]}>
            {percent}%
          </Text>
        </View>
      </View>
    </View>
  )
}

interface VotableOptionRowProps {
  option: PollOption
  onVote: (optionId: string) => void
}

function VotableOptionRow({ option, onVote }: VotableOptionRowProps) {
  const { theme } = useTheme()

  return (
    <TouchableOpacity
      onPress={() => onVote(option.id)}
      activeOpacity={0.7}
      style={[
        styles.votableRow,
        {
          borderColor: theme.border,
          backgroundColor: theme.surface,
        },
      ]}
    >
      <Text style={[styles.optionText, { color: theme.textPrimary }]} numberOfLines={2}>
        {option.text}
      </Text>
    </TouchableOpacity>
  )
}

// --- Main component ---

export function PollCard({ poll, userVote, onVote }: PollCardProps) {
  const { theme } = useTheme()

  const expired = isExpired(poll.endsAt)
  const hasVoted = userVote !== null
  const showResults = hasVoted || expired

  const total = totalVotes(poll.options)
  const winner = expired ? winningOptionId(poll.options) : null

  return (
    <View style={styles.container}>
      {/* Poll question */}
      <Text style={[styles.question, { color: theme.textPrimary }]}>
        {poll.question}
      </Text>

      {/* Option rows */}
      <View style={styles.optionsList}>
        {poll.options.map((option) => {
          if (showResults) {
            return (
              <VotedOptionRow
                key={option.id}
                option={option}
                percent={votePercent(option, total)}
                isUserChoice={option.id === userVote}
                isWinner={option.id === winner}
              />
            )
          }

          return (
            <VotableOptionRow key={option.id} option={option} onVote={onVote} />
          )
        })}
      </View>

      {/* Footer: vote count + expiry */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          {total} {total === 1 ? 'vote' : 'votes'}
        </Text>
        <Text style={[styles.footerSeparator, { color: theme.textMuted }]}>·</Text>
        <Text style={[styles.footerText, { color: theme.textMuted }]}>
          {formatExpiry(poll.endsAt)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  question: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    lineHeight: 20,
  },
  optionsList: {
    gap: spacing.xs,
  },
  // Before-vote option: bordered tappable row
  votableRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  // After-vote option: bar track
  optionRow: {
    borderRadius: radius.md,
    overflow: 'hidden',
    minHeight: 44,
  },
  barTrack: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: radius.md,
    opacity: 0.25,
  },
  barContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  optionText: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    lineHeight: 20,
  },
  percentText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    marginLeft: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  footerSeparator: {
    fontSize: typography.sizes.sm,
  },
})

export default PollCard
