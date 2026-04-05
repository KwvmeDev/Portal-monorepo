import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import type { MessageWithSender, MessagePage } from '@portal/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches a conversation and verifies that userId is one of its participants.
 *
 * Throws ApiError.notFound when the conversation does not exist.
 * Throws ApiError.forbidden when userId is neither participant1Id nor participant2Id.
 */
async function fetchConversationForParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  })

  if (!conversation) {
    throw ApiError.notFound('Conversation not found')
  }

  if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
    throw ApiError.forbidden('You are not a participant in this conversation')
  }

  return conversation
}

// ─── Message Service ──────────────────────────────────────────────────────────

export const messageService = {
  /**
   * Creates a new Message row in the given conversation and updates the
   * conversation's lastMessageAt timestamp — both in a single transaction.
   *
   * Validation:
   *   - content must be non-empty after trimming (400 bad request)
   *   - senderId must be a participant of conversationId (403 forbidden)
   *   - conversationId must exist (404 not found)
   *
   * Returns the created message with sender fields inlined.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<MessageWithSender> {
    // Validate content before any DB work
    if (!content.trim()) {
      throw ApiError.badRequest('Message content cannot be empty')
    }

    // Verify conversation exists and senderId is a participant
    await fetchConversationForParticipant(conversationId, senderId)

    // Create message and bump lastMessageAt atomically
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId, senderId, content },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ])

    // Fetch the created message with sender relation joined
    const messageWithSender = await prisma.message.findUnique({
      where: { id: message.id },
      include: {
        sender: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    })

    // messageWithSender will always be present; we just created the row above
    if (!messageWithSender) {
      throw ApiError.internal('Failed to retrieve created message')
    }

    return {
      id: messageWithSender.id,
      conversationId: messageWithSender.conversationId,
      senderId: messageWithSender.senderId,
      senderUsername: messageWithSender.sender.username,
      senderDisplayName: messageWithSender.sender.displayName,
      senderAvatarUrl: messageWithSender.sender.avatarUrl,
      content: messageWithSender.content,
      isRead: messageWithSender.isRead,
      createdAt: messageWithSender.createdAt.toISOString(),
    }
  },

  /**
   * Returns a cursor-paginated page of messages for the given conversation,
   * ordered by createdAt DESC (newest first).
   *
   * Side-effect: marks all messages in the thread sent by the other participant
   * as isRead = true before fetching, so the returned rows reflect updated state.
   *
   * Throws ApiError.forbidden when userId is not a participant.
   * Throws ApiError.notFound when the conversation does not exist.
   */
  async getMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
  ): Promise<MessagePage> {
    // Verify conversation exists and userId is a participant
    await fetchConversationForParticipant(conversationId, userId)

    // Mark all unread messages from the other participant as read BEFORE fetching
    // so the returned rows already reflect the updated isRead state
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    })

    // Fetch PAGE_SIZE + 1 rows to detect whether a next page exists
    const rows = await prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasNextPage = rows.length > PAGE_SIZE
    const pageRows = rows.slice(0, PAGE_SIZE)

    const messages: MessageWithSender[] = pageRows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      senderUsername: row.sender.username,
      senderDisplayName: row.sender.displayName,
      senderAvatarUrl: row.sender.avatarUrl,
      content: row.content,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    }))

    const lastRow = pageRows[pageRows.length - 1]
    const nextCursor = hasNextPage && lastRow ? lastRow.id : null

    return { messages, nextCursor }
  },
}
