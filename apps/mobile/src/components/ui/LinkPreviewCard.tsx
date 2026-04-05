import React from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useTheme } from '../../theme/useTheme'
import { colors, typography, spacing, radius } from '../../theme/tokens'
import type { LinkPreview } from '@portal/types'

interface LinkPreviewCardProps {
  preview: LinkPreview
}

/** Extracts the readable domain (e.g. "nytimes.com") from a full URL string. */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function openLink(url: string): Promise<void> {
  await WebBrowser.openBrowserAsync(url)
}

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  const { theme } = useTheme()
  const domain = extractDomain(preview.url)

  return (
    <TouchableOpacity
      onPress={() => openLink(preview.url)}
      activeOpacity={0.85}
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* OG image — 16:9 aspect ratio */}
      {preview.imageUrl ? (
        <Image
          source={{ uri: preview.imageUrl }}
          style={styles.ogImage}
          resizeMode="cover"
          accessibilityLabel={`Preview image for ${preview.title}`}
        />
      ) : (
        // Placeholder strip when no OG image is available
        <View
          style={[styles.ogImagePlaceholder, { backgroundColor: theme.surfaceElevated }]}
        />
      )}

      {/* Text content block */}
      <View style={styles.textBlock}>
        <Text
          style={[styles.domain, { color: theme.textMuted }]}
          numberOfLines={1}
        >
          {domain}
        </Text>

        <Text
          style={[styles.title, { color: theme.textPrimary }]}
          numberOfLines={2}
        >
          {preview.title}
        </Text>

        {preview.description ? (
          <Text
            style={[styles.description, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {preview.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // 16:9 aspect ratio for OG image
  ogImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  ogImagePlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  textBlock: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  domain: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    textTransform: 'lowercase',
  },
  title: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semiBold,
    lineHeight: 20,
  },
  description: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 18,
  },
})

export default LinkPreviewCard
