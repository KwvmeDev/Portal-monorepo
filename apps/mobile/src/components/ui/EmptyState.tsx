import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { typography, spacing } from '../../theme/tokens'
import { Button } from './Button'

interface EmptyStateAction {
  /** Label shown on the call-to-action button */
  label: string
  /** Callback invoked when the button is pressed */
  onPress: () => void
}

interface EmptyStateProps {
  /** Icon element rendered above the title (e.g. an SVG or emoji Text node) */
  icon: React.ReactNode
  /** Primary heading text */
  title: string
  /** Secondary descriptive text shown below the title */
  subtitle: string
  /** Optional call-to-action. When provided a ghost Button is rendered below subtitle. */
  action?: EmptyStateAction
}

/**
 * EmptyState — centered layout for zero-data screens.
 *
 * Used in feed tabs, org pages, profile pages, etc. to communicate
 * why there is no content and offer a relevant next action when applicable.
 *
 * Example instances from sprint spec:
 *   - Global feed empty: "No posts yet. Follow some people to get started."
 *   - Campus feed empty: "No posts from your campus yet. Be the first."
 *   - Org feed empty:    "This org hasn't posted yet."
 */
export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  const { theme } = useTheme()

  return (
    <View style={styles.container}>
      {/* Icon area — accepts any renderable node so callers control the icon type */}
      <View style={styles.iconWrapper}>{icon}</View>

      <Text
        style={[
          styles.title,
          { color: theme.textSecondary },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.subtitle,
          { color: theme.textMuted },
        ]}
      >
        {subtitle}
      </Text>

      {/* CTA button — only rendered when action prop is supplied */}
      {action !== undefined && (
        <Button
          variant="ghost"
          size="sm"
          onPress={action.onPress}
          style={styles.actionButton}
        >
          {action.label}
        </Button>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl,
  },
  iconWrapper: {
    marginBottom: spacing.lg,
    opacity: 0.5,
  },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.sizes.md,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    textAlign: 'center',
    lineHeight: typography.sizes.base * 1.5,
    marginBottom: spacing.xl,
  },
  actionButton: {
    alignSelf: 'center',
  },
})

export default EmptyState
