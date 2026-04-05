/**
 * MessagesScreen — conversation list showing all direct message threads for
 * the authenticated user.
 *
 * Features:
 *   - useQuery hitting GET /api/conversations, refetching on every screen focus
 *     via useFocusEffect so unread counts always reflect the latest state.
 *   - FlatList with one row per ConversationSummary: avatar (48px with initials
 *     fallback), display name, last message preview, relative timestamp.
 *   - Unread indicator: name + preview render in colors.paper (not muted) when
 *     unreadCount > 0; a filled 8px dot in colors.signal appears beside the time.
 *   - Tapping a row navigates to ConversationScreen with the required params.
 *   - ActivityIndicator while loading; EmptyState when list is empty.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useFocusEffect, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { api } from '../../services/api'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { colors, typography, spacing } from '../../theme/tokens'
import type { ConversationSummary, UserSummary, SearchResults } from '@portal/types'
import { useLanguage } from '../../i18n/LanguageContext'

const DEBOUNCE_MS = 350

// ---------------------------------------------------------------------------
// Navigation types
// ---------------------------------------------------------------------------

/**
 * Param list for the Messages stack.
 * MessagesList is the root; Conversation is navigated to on row press.
 */
export type MessagesStackParamList = {
  /** focusSearch: when true, MessagesScreen will imperatively focus the search input */
  MessagesList: { focusSearch?: boolean } | undefined
  Conversation: {
    conversationId: string
    otherUserId: string
    otherDisplayName: string
  }
}

type MessagesScreenNavProp = NativeStackNavigationProp<
  MessagesStackParamList,
  'MessagesList'
>

interface MessagesScreenProps {
  navigation: MessagesScreenNavProp
}

// ---------------------------------------------------------------------------
// Time helper — converts an ISO date string to a short relative label.
// Mirrors the helper in NotificationItem to keep the style consistent.
// ---------------------------------------------------------------------------

function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  const diffWeeks = Math.floor(diffDays / 7)
  return `${diffWeeks}w ago`
}

// ---------------------------------------------------------------------------
// ConversationRow — single row in the conversation list
// ---------------------------------------------------------------------------

interface ConversationRowProps {
  item: ConversationSummary
  onPress: (item: ConversationSummary) => void
}

function ConversationRow({ item, onPress }: ConversationRowProps) {
  const isUnread = item.unreadCount > 0

  // First character of the other user's display name used as initials fallback
  const fallbackInitial = item.otherDisplayName?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${item.otherDisplayName}`}
      accessibilityHint={item.lastMessage ?? undefined}
    >
      {/* Avatar — image when URL present, else initials circle */}
      {item.otherAvatarUrl ? (
        <Image
          source={{ uri: item.otherAvatarUrl }}
          style={styles.avatar}
          accessibilityLabel={`${item.otherDisplayName}'s avatar`}
        />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{fallbackInitial}</Text>
        </View>
      )}

      {/* Right column: two rows of content */}
      <View style={styles.content}>
        {/* Row 1: display name + timestamp */}
        <View style={styles.contentRow}>
          <Text
            style={[styles.displayName, isUnread && styles.displayNameUnread]}
            numberOfLines={1}
          >
            {item.otherDisplayName}
          </Text>
          <View style={styles.metaGroup}>
            <Text style={styles.timeText}>
              {timeAgo(item.lastMessageAt)}
            </Text>
            {/* Unread dot — only shown when there are unread messages */}
            {isUnread && <View style={styles.unreadDot} />}
          </View>
        </View>

        {/* Row 2: last message preview */}
        <Text
          style={[styles.preview, isUnread && styles.previewUnread]}
          numberOfLines={1}
        >
          {item.lastMessage ?? 'No messages yet'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// UserSearchRow — result row when searching for a user to DM
// ---------------------------------------------------------------------------

interface UserSearchRowProps {
  user: UserSummary
  onPress: () => void
  isLoading: boolean
}

function UserSearchRow({ user, onPress, isLoading }: UserSearchRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLoading}
      accessibilityRole="button"
      accessibilityLabel={`Message ${user.displayName}`}
    >
      <Avatar uri={user.avatarUrl} name={user.displayName} size="md" />
      <View style={styles.content}>
        <Text style={styles.displayName} numberOfLines={1}>{user.displayName}</Text>
        <Text style={styles.preview} numberOfLines={1}>@{user.username}</Text>
      </View>
      {isLoading && <ActivityIndicator size="small" color={colors.signal} />}
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// MessagesScreen
// ---------------------------------------------------------------------------

export function MessagesScreen({ navigation }: MessagesScreenProps) {
  const route = useRoute<RouteProp<MessagesStackParamList, 'MessagesList'>>()
  const searchInputRef = useRef<TextInput>(null)
  const { t } = useLanguage()

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [openingUserId, setOpeningUserId] = useState<string | null>(null)

  // When the FAB on the Messages tab is pressed, the navigator navigates here
  // with focusSearch: true. Focus the search input so the user can immediately
  // type a name. The param is cleared after reading so repeated presses work.
  useEffect(() => {
    if (route.params?.focusSearch) {
      // Small delay allows the screen to be fully mounted/visible before focusing
      const t = setTimeout(() => searchInputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [route.params?.focusSearch])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchQuery])

  // ── Query: GET /api/conversations ─────────────────────────────────────────

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<ConversationSummary[]>('/conversations'),
  })

  // Refetch every time the screen comes into focus so counts stay fresh
  useFocusEffect(
    useCallback(() => {
      refetch()
    }, [refetch]),
  )

  // ── Query: search users ────────────────────────────────────────────────────

  const { data: searchData, isLoading: isSearching } = useQuery({
    queryKey: ['search', 'users', debouncedQuery],
    queryFn: () =>
      api.get<SearchResults>(`/search?q=${encodeURIComponent(debouncedQuery)}&type=users`),
    enabled: debouncedQuery.length > 0,
  })

  const searchResults: UserSummary[] = searchData?.users ?? []

  // ── Mutation: open/create a DM conversation ────────────────────────────────

  const { mutate: openConversation } = useMutation({
    mutationFn: (otherUserId: string) =>
      api.post<{ conversationId: string }>('/conversations', { otherUserId }),
    onSuccess: ({ conversationId }, otherUserId) => {
      const user = searchResults.find((u) => u.id === otherUserId)
      setSearchQuery('')
      setOpeningUserId(null)
      navigation.navigate('Conversation', {
        conversationId,
        otherUserId,
        otherDisplayName: user?.displayName ?? '',
      })
    },
    onError: () => setOpeningUserId(null),
  })

  const handleUserPress = useCallback(
    (user: UserSummary) => {
      setOpeningUserId(user.id)
      openConversation(user.id)
    },
    [openConversation],
  )

  // ── FlatList callbacks ─────────────────────────────────────────────────────

  const handleRowPress = useCallback(
    (item: ConversationSummary) => {
      navigation.navigate('Conversation', {
        conversationId: item.id,
        otherUserId: item.otherUserId,
        otherDisplayName: item.otherDisplayName,
      })
    },
    [navigation],
  )

  const renderItem: ListRenderItem<ConversationSummary> = useCallback(
    ({ item }) => <ConversationRow item={item} onPress={handleRowPress} />,
    [handleRowPress],
  )

  const keyExtractor = useCallback((item: ConversationSummary) => item.id, [])

  const conversations = data ?? []
  const isSearchMode = searchQuery.length > 0

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('messages')}</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('searchPeople')}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.headerBorder} />

      {/* Search results */}
      {isSearchMode ? (
        isSearching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.signal} />
          </View>
        ) : searchResults.length === 0 ? (
          <EmptyState
            icon={<Text style={styles.emptyIcon}>🔍</Text>}
            title={t('noUsersFound')}
            subtitle={`No one matched "${debouncedQuery}"`}
          />
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <UserSearchRow
                user={item}
                onPress={() => handleUserPress(item)}
                isLoading={openingUserId === item.id}
              />
            )}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
      ) : (
        /* Conversation list */
        isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.signal} />
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={
              conversations.length === 0 ? styles.emptyContainer : undefined
            }
            ListEmptyComponent={
              <EmptyState
                icon={<Text style={styles.emptyIcon}>💬</Text>}
                title={t('noMessagesYet')}
                subtitle={t('startConversation')}
              />
            }
          />
        )
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const AVATAR_SIZE = 48

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.void,
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },
  headerBorder: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // ── Search bar ──────────────────────────────────────────────────────────────

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    color: colors.paper,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
  },
  clearBtn: {
    marginLeft: spacing.sm,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: colors.muted,
    fontSize: typography.sizes.xl,
    lineHeight: 24,
  },

  // ── Search result separator ─────────────────────────────────────────────────

  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: AVATAR_SIZE + spacing.lg + spacing.sm,
  },

  // ── Loading ─────────────────────────────────────────────────────────────────

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Conversation row ────────────────────────────────────────────────────────

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.void,
  },

  // ── Avatar ──────────────────────────────────────────────────────────────────

  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    resizeMode: 'cover',
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.paper,
  },

  // ── Right content column ────────────────────────────────────────────────────

  content: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  // Display name — regular weight when read, bold when unread
  displayName: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.muted,
    marginRight: spacing.sm,
  },
  displayNameUnread: {
    fontFamily: typography.fontFamily.bold,
    color: colors.paper,
  },

  // Timestamp + unread dot grouped on the far right
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  timeText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },

  // Unread dot — 8px circle in signal green
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.signal,
    marginLeft: spacing.xs,
    flexShrink: 0,
  },

  // Last message preview — muted when read, paper when unread
  preview: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
  },
  previewUnread: {
    color: colors.paper,
  },

  // ── Empty state ─────────────────────────────────────────────────────────────

  // Forces FlatList content to fill available height so EmptyState centers
  emptyContainer: {
    flexGrow: 1,
  },
  emptyIcon: {
    fontSize: 32,
  },
})

export default MessagesScreen
