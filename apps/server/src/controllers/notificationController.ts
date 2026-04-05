import { Request, Response, NextFunction } from 'express'
import { notificationService } from '../services/notificationService'
import { ApiError } from '../utils/ApiError'

// ─── getNotifications ─────────────────────────────────────────────────────────

/**
 * GET /api/notifications  (authenticated)
 *
 * Query: ?cursor=<notification id string>
 *
 * Returns a paginated page of notifications for the authenticated user,
 * ordered by createdAt DESC. Cursor is the id of the last item on the
 * previous page.
 *
 * Returns 200 with { notifications, nextCursor, unreadCount }.
 */
export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page = await notificationService.getNotifications(req.user.id, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── markAsRead ───────────────────────────────────────────────────────────────

/**
 * PATCH /api/notifications/:id/read  (authenticated)
 *
 * Marks a single notification as read. The notification must belong to the
 * authenticated user — returns 404 if it does not exist or is owned by
 * another user (prevents id enumeration).
 *
 * Returns 204 on success.
 */
export async function markAsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params

    await notificationService.markAsRead(id, req.user.id)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ─── markAllAsRead ────────────────────────────────────────────────────────────

/**
 * PATCH /api/notifications/read-all  (authenticated)
 *
 * Marks all unread notifications for the authenticated user as read in a
 * single bulk update. Safe to call when there are no unread notifications.
 *
 * Returns 204 on success.
 */
export async function markAllAsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    await notificationService.markAllAsRead(req.user.id)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
