/**
 * ConversationScreen — 1-to-1 direct message thread.
 *
 * Route params:
 *   conversationId  — the DM conversation ID
 *   otherUserId     — the other participant's user ID (used for future profile nav)
 *   otherDisplayName — shown in the navigation header title
 *
 * Layout:
 *   - Navigation header provides the title + top safe area.
 *   - SafeAreaView edges={['bottom']} handles the home indicator on iOS.
 *   - Inverted FlatList: newest messages display at the bottom visually;
 *     API returns messages newest-first so the list just renders them
 *     in-order (index 0 = newest = visual bottom).
 *   - onEndReached on the inverted list fires when the user scrolls UP —
 *     this is where we load older messages via fetchNextPage.
 *   - KeyboardAvoidingView keeps the send bar above the software keyboard.
 */

import React, { useCallback, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  type ListRenderItem,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../../components/ui/Avatar'
import { colors, typography, spacing } from '../../theme/tokens'
import type { MessageWithSender, MessagePage } from '@portal/types'
import { useLanguage } from '../../i18n/LanguageContext'
// Import the shared param list from MessagesScreen so both screens share a
// single source of truth for the Messages stack route definitions.
import type { MessagesStackParamList } from './MessagesScreen'

// ---------------------------------------------------------------------------
// Navigation types
// ---------------------------------------------------------------------------

type ConversationRouteProp = RouteProp<MessagesStackParamList, 'Conversation'>
type ConversationNavProp = NativeStackNavigationProp<MessagesStackParamList, 'Conversation'>

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

interface SendMessageResponse {
  message: MessageWithSender
}

// ---------------------------------------------------------------------------
// Message bubble component
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: MessageWithSender
  isOwn: boolean
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <View
      style={[
        styles.bubbleRow,
        isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther,
      ]}
    >
      {/* Avatar only shown for received messages, to the left of the bubble */}
      {!isOwn && (
        <Avatar
          uri={message.senderAvatarUrl}
          name={message.senderDisplayName}
          size="xs"
        />
      )}

      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
        ]}
      >
        <Text style={styles.bubbleText}>{message.content}</Text>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// ConversationScreen
// ---------------------------------------------------------------------------

export function ConversationScreen() {
  const route = useRoute<ConversationRouteProp>()
  const navigation = useNavigation<ConversationNavProp>()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const { t } = useLanguage()

  const { conversationId, otherDisplayName } = route.params

  // Set the navigation header title to the other participant's display name.
  // Using setOptions here so it is set once after mount; the header is
  // managed by the native stack navigator.
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: otherDisplayName })
  }, [navigation, otherDisplayName])

  const [inputText, setInputText] = useState('')
  const inputRef = useRef<TextInput>(null)

  // ------------------------------------------------------------------
  // Fetch messages (newest-first cursor pagination)
  // ------------------------------------------------------------------

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? `?cursor=${pageParam}` : ''
      return api.get<MessagePage>(`/conversations/${conversationId}/messages${cursor}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  // Flatten all pages into a single ordered array.
  // Pages[0] is the newest page; within each page messages are newest-first.
  // The inverted FlatList renders index 0 at the visual bottom, so this order
  // gives us newest message at the bottom — correct for a chat UI.
  const messages = data?.pages.flatMap((page) => page.messages) ?? []

  // ------------------------------------------------------------------
  // Send message mutation
  // ------------------------------------------------------------------

  const { mutate: sendMessage, isPending: isSending } = useMutation({
    mutationFn: (content: string) =>
      api.post<SendMessageResponse>(
        `/conversations/${conversationId}/messages`,
        { content },
      ),
    onSuccess: () => {
      // Invalidate both the thread and the conversations list so the preview
      // row in MessagesScreen shows the new last message.
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setInputText('')
    },
  })

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim()
    if (!trimmed || isSending) return
    sendMessage(trimmed)
  }, [inputText, isSending, sendMessage])

  // Inverted list: onEndReached fires when the user scrolls toward the top
  // (visually), which is the "older messages" direction.
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const renderItem: ListRenderItem<MessageWithSender> = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === currentUser?.id}
      />
    ),
    [currentUser?.id],
  )

  const keyExtractor = useCallback(
    (item: MessageWithSender) => item.id,
    [],
  )

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const isSendDisabled = !inputText.trim() || isSending

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    // edges={['bottom']} — nav header + RN status bar handle the top inset;
    // we only need the home indicator / bottom inset covered here.
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // Extra offset to clear the navigation header height on iOS.
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* ── Message list ────────────────────────────────────────────── */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.signal} />
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            // inverted renders index 0 at the visual bottom — matches newest-first API order
            inverted
            contentContainerStyle={styles.listContent}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              // Footer in an inverted list is rendered at the visual top
              isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={colors.signal} size="small" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {t('sayHello')}
                </Text>
              </View>
            }
          />
        )}

        {/* ── Send bar ────────────────────────────────────────────────── */}
        <View style={styles.sendBar}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('messagePlaceholder')}
            placeholderTextColor={colors.muted}
            multiline
            // Constrain to approximately 4 lines before scrolling inside the input
            maxHeight={96}
            returnKeyType="default"
            blurOnSubmit={false}
            accessibilityLabel="Message input"
          />

          <TouchableOpacity
            onPress={handleSend}
            disabled={isSendDisabled}
            activeOpacity={0.8}
            style={[
              styles.sendButton,
              isSendDisabled && styles.sendButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: isSendDisabled }}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.void} />
            ) : (
              // Up-arrow character — no icon library required
              <Text style={styles.sendButtonIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1,
  },

  // ── Loading / empty ─────────────────────────────────────────────────────────

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoader: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    // In an inverted list the empty component is rotated 180° by RN —
    // use scaleY to flip it back so text reads correctly.
    transform: [{ scaleY: -1 }],
  },
  emptyStateText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.muted,
    textAlign: 'center',
  },

  // ── Message list ─────────────────────────────────────────────────────────────

  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexGrow: 1,
  },

  // ── Bubble layout ────────────────────────────────────────────────────────────

  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: spacing.xs,
    maxWidth: '80%',
  },
  bubbleRowOwn: {
    // Push own messages to the right edge
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  bubbleRowOther: {
    // Received messages stay on the left, with a gap between avatar and bubble
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    flexShrink: 1,
  },
  bubbleOwn: {
    backgroundColor: colors.signal,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.paper,
    lineHeight: 20,
  },

  // ── Send bar ─────────────────────────────────────────────────────────────────

  sendBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.void,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    // Top/bottom padding to vertically centre single-line text and look
    // natural as the input grows to multiple lines.
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.paper,
    // maxHeight is set on the component — controls when it starts scrolling
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
    // Keep the button pinned at the bottom when the input grows tall
    alignSelf: 'flex-end',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonIcon: {
    fontSize: 18,
    color: colors.void,
    fontFamily: typography.fontFamily.bold,
    // Slight nudge to visually centre the arrow glyph
    lineHeight: 20,
  },
})

export default ConversationScreen
