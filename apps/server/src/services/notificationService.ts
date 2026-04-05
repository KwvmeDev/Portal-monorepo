import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import type { NotificationWithDetails, NotificationPage, NotificationType } from '@portal/types'
import { pushService } from './pushService'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ─── Param Types ──────────────────────────────────────────────────────────────

export interface CreateNotificationParams {
  /** ID of the user who will receive this notification. */
  recipientId: string
  type: NotificationType
  actorId: string
  /** Polymorphic target entity ID (e.g. comment id, post id, user id). */
  targetId: string
  /** Polymorphic target entity type string (e.g. 'comment', 'post', 'user'). */
  targetType: string
}

// ─── Notification Service ─────────────────────────────────────────────────────

export const notificationService = {
  /**
   * Inserts a Notification row into the database.
   *
   * Silently no-ops when recipientId === actorId — users should never receive
   * notifications about their own actions.
   */
  async createNotification(params: CreateNotificationParams): Promise<void> {
    const { recipientId, type, actorId, targetId, targetType } = params

    if (recipientId === actorId) {
      return
    }

    await prisma.notification.create({
      data: {
        recipientId,
        type,
        actorId,
        targetId,
        targetType,
      },
    })

    // Fetch the actor's display name for the push notification title.
    // This is a separate query intentionally — the create above has already
    // committed, so this lookup does not affect the DB write outcome.
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { displayName: true },
    })
    const actorDisplay = actor?.displayName ?? 'Someone'

    // Map NotificationType to a human-readable push title.
    let pushTitle: string
    switch (type) {
      case 'follow':
        pushTitle = `${actorDisplay} followed you`
        break
      case 'comment':
        pushTitle = `${actorDisplay} commented on your post`
        break
      case 'reply':
        pushTitle = `${actorDisplay} replied to your comment`
        break
      case 'upvote_post':
        pushTitle = `${actorDisplay} upvoted your post`
        break
      case 'mention':
        pushTitle = `${actorDisplay} mentioned you`
        break
      default:
        pushTitle = `${actorDisplay} sent you a notification`
    }

    // Fire-and-forget: push failure must not affect the already-committed
    // notification row. The void keyword prevents the unhandled-promise lint
    // warning while making the intentional non-await explicit.
    void pushService.sendPushToUser(recipientId, pushTitle, pushTitle)
  },

  /**
   * Returns a paginated page of notifications for the given userId (recipientId).
   *
   * Rows are ordered by createdAt DESC. Cursor is the notification id of the
   * last item on the previous page. Fetches PAGE_SIZE + 1 rows to detect
   * whether a next page exists.
   *
   * Actor fields are joined via the actor relation on the Notification model.
   * Also returns the total unread count for badge display.
   */
  async getNotifications(userId: string, cursor?: string): Promise<NotificationPage> {
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: userId },
        include: {
          actor: {
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
      }),
      prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
    ])

    const hasNextPage = rows.length > PAGE_SIZE
    const pageRows = rows.slice(0, PAGE_SIZE)

    const notifications: NotificationWithDetails[] = pageRows.map((row) => ({
      id: row.id,
      recipientId: row.recipientId,
      type: row.type as NotificationType,
      actorId: row.actorId,
      actorUsername: row.actor.username,
      actorDisplayName: row.actor.displayName,
      actorAvatarUrl: row.actor.avatarUrl,
      targetId: row.targetId,
      targetType: row.targetType,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    }))

    const lastRow = pageRows[pageRows.length - 1]
    const nextCursor = hasNextPage && lastRow ? lastRow.id : null

    return { notifications, nextCursor, unreadCount }
  },

  /**
   * Marks a single notification as read for the owning user.
   *
   * Throws 404 when the notification does not exist or belongs to a
   * different user.
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, recipientId: true },
    })

    if (!existing || existing.recipientId !== userId) {
      throw ApiError.notFound('Notification not found')
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    })
  },

  /**
   * Marks all unread notifications for the given userId as read in a single
   * bulk update.
   */
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    })
  },
}
