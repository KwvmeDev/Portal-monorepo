import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import type { ConversationSummary } from '@portal/types'

// ─── Conversation Service ─────────────────────────────────────────────────────

export const conversationService = {
  /**
   * Returns all conversations for the given userId, ordered by lastMessageAt DESC.
   *
   * For each conversation, the "other" participant is resolved relative to the
   * caller — participant1 when caller is participant2, otherwise participant2.
   * Unread count is the number of messages in that conversation sent by the
   * other participant (senderId !== userId) that have not yet been read.
   */
  async getConversations(userId: string): Promise<ConversationSummary[]> {
    // Fetch all conversations where userId occupies either participant slot,
    // including both participant user records and the latest message preview.
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      include: {
        participant1: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        participant2: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        // Grab the single most-recent message for the last-message preview text.
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (conversations.length === 0) {
      return []
    }

    // Batch-fetch unread counts for all relevant conversations in one query,
    // then build a lookup map to avoid N+1 queries.
    const convIds = conversations.map((c) => c.id)

    const unreadGroups = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: convIds },
        // Only messages FROM the other participant count as unread for this user.
        senderId: { not: userId },
        isRead: false,
      },
      _count: { id: true },
    })

    // Map<conversationId, unreadCount> for O(1) lookup during the mapping below.
    const unreadMap = new Map<string, number>(
      unreadGroups.map((g) => [g.conversationId, g._count.id]),
    )

    return conversations.map((conv) => {
      // Determine which participant is the "other" user from the caller's view.
      const other =
        conv.participant1Id === userId ? conv.participant2 : conv.participant1

      return {
        id: conv.id,
        otherUserId: other.id,
        otherUsername: other.username,
        otherDisplayName: other.displayName,
        otherAvatarUrl: other.avatarUrl,
        lastMessage: conv.messages[0]?.content ?? null,
        lastMessageAt: conv.lastMessageAt.toISOString(),
        unreadCount: unreadMap.get(conv.id) ?? 0,
      } satisfies ConversationSummary
    })
  },

  /**
   * Returns the id of the existing Conversation between userId and otherUserId,
   * or creates a new one if none exists.
   *
   * The @@unique constraint on (participant1Id, participant2Id) requires
   * consistent ordering — the lexicographically lower id is always stored as
   * participant1Id to guarantee deduplication regardless of call order.
   *
   * Throws ApiError.badRequest when userId === otherUserId.
   */
  async getOrCreateConversation(userId: string, otherUserId: string): Promise<string> {
    if (userId === otherUserId) {
      throw ApiError.badRequest('Cannot create a conversation with yourself')
    }

    // Sort so the lower string is always participant1Id — mirrors the schema's
    // @@unique([participant1Id, participant2Id]) constraint.
    const [participant1Id, participant2Id] = [userId, otherUserId].sort()

    const existing = await prisma.conversation.findUnique({
      where: { participant1Id_participant2Id: { participant1Id, participant2Id } },
      select: { id: true },
    })

    if (existing) {
      return existing.id
    }

    const created = await prisma.conversation.create({
      data: { participant1Id, participant2Id },
      select: { id: true },
    })

    return created.id
  },
}
