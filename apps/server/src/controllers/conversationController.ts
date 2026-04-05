import { Request, Response, NextFunction } from 'express'
import { conversationService } from '../services/conversationService'
import { messageService } from '../services/messageService'
import { ApiError } from '../utils/ApiError'

// ─── getConversations ─────────────────────────────────────────────────────────

/**
 * GET /api/conversations  (authenticated)
 *
 * Returns all conversations for the authenticated user, ordered by
 * lastMessageAt DESC. Each entry includes the other participant's profile
 * fields, the last message preview, and the unread count.
 *
 * Returns 200 with ConversationSummary[].
 */
export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const conversations = await conversationService.getConversations(req.user.id)

    res.status(200).json(conversations)
  } catch (err) {
    next(err)
  }
}

// ─── createConversation ───────────────────────────────────────────────────────

/**
 * POST /api/conversations  (authenticated)
 *
 * Body: { otherUserId: string }
 *
 * Returns the existing or newly created conversation id. Idempotent — calling
 * twice with the same pair of users always returns the same conversationId.
 *
 * Returns 200 with { conversationId: string }.
 */
export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { otherUserId } = req.body as { otherUserId: string }

    if (!otherUserId || typeof otherUserId !== 'string') {
      return next(ApiError.badRequest('otherUserId is required'))
    }

    const conversationId = await conversationService.getOrCreateConversation(
      req.user.id,
      otherUserId,
    )

    res.status(200).json({ conversationId })
  } catch (err) {
    next(err)
  }
}

// ─── getMessages ──────────────────────────────────────────────────────────────

/**
 * GET /api/conversations/:id/messages  (authenticated)
 *
 * Query: ?cursor=<message id string>
 *
 * Returns a cursor-paginated page of messages for the conversation, ordered
 * newest first. Also marks all unread messages from the other participant as
 * read (side-effect handled by the service layer).
 *
 * Returns 200 with MessagePage.
 */
export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const conversationId = req.params.id
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page = await messageService.getMessages(conversationId, req.user.id, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

/**
 * POST /api/conversations/:id/messages  (authenticated)
 *
 * Body: { content: string }
 *
 * Creates a new message in the conversation and bumps the conversation's
 * lastMessageAt timestamp atomically.
 *
 * Returns 201 with MessageWithSender.
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const conversationId = req.params.id
    const { content } = req.body as { content: string }

    if (!content || typeof content !== 'string') {
      return next(ApiError.badRequest('content is required'))
    }

    const message = await messageService.sendMessage(conversationId, req.user.id, content)

    res.status(201).json(message)
  } catch (err) {
    next(err)
  }
}
