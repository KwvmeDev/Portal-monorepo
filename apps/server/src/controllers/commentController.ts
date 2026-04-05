import { Request, Response, NextFunction } from 'express'
import { commentService } from '../services/commentService'
import { ApiError } from '../utils/ApiError'
import type { CommentPage, CommentWithDetails } from '@portal/types'

// ─── createComment ────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:postId/comments  (authenticated)
 *
 * Body: { content: string, parentId?: string }
 *
 * Creates a new comment on the given post. Increments the post's commentCount
 * atomically. parentId is optional — omit for a top-level comment.
 *
 * Returns 201 + { comment: CommentWithDetails }
 */
export async function createComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { postId } = req.params
    const { content, parentId } = req.body as { content: unknown; parentId?: unknown }

    // Validate that content is a non-empty string
    if (typeof content !== 'string' || content.trim().length === 0) {
      return next(ApiError.badRequest('content is required and must be a non-empty string'))
    }

    const comment: CommentWithDetails = await commentService.createComment(
      postId,
      req.user.id,
      content,
      typeof parentId === 'string' ? parentId : null,
    )

    res.status(201).json({ comment })
  } catch (err) {
    next(err)
  }
}

// ─── getComments ──────────────────────────────────────────────────────────────

/**
 * GET /api/posts/:postId/comments  (auth optional)
 *
 * Query: ?cursor=<base64-encoded cursor>
 *
 * Returns a paginated page of top-level comments with up to 3 inline replies
 * each. When authenticated, user vote state is included per comment.
 *
 * Returns 200 + CommentPage
 */
export async function getComments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { postId } = req.params
    const userId = req.user?.id
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page: CommentPage = await commentService.getComments(postId, userId, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── deleteComment ────────────────────────────────────────────────────────────

/**
 * DELETE /api/comments/:commentId  (authenticated)
 *
 * Soft-deletes a comment (isRemoved = true). The requester must be the comment
 * author, a moderator, or an admin. Decrements Post.commentCount atomically.
 *
 * Returns 204 No Content
 */
export async function deleteComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { commentId } = req.params

    await commentService.deleteComment(commentId, req.user.id, req.user.role)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ─── voteOnComment ────────────────────────────────────────────────────────────

/**
 * POST /api/comments/:commentId/vote  (authenticated)
 *
 * Body: { value: 'up' | 'down' }
 *
 * Applies a vote on a comment. Handles three cases atomically via commentService:
 *   - No prior vote → inserts and increments the matching counter
 *   - Same vote again → removes and decrements (toggle off)
 *   - Opposite vote → updates vote and swaps counters
 *
 * Returns 200 + { comment: CommentWithDetails }
 */
export async function voteOnComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { commentId } = req.params
    const { value } = req.body as { value: unknown }

    // Validate that value is exactly 'up' or 'down'
    if (value !== 'up' && value !== 'down') {
      return next(ApiError.badRequest("value must be 'up' or 'down'"))
    }

    const comment: CommentWithDetails = await commentService.voteComment(
      commentId,
      req.user.id,
      value,
    )

    res.status(200).json({ comment })
  } catch (err) {
    next(err)
  }
}

// ─── removeCommentVote ────────────────────────────────────────────────────────

/**
 * DELETE /api/comments/:commentId/vote  (authenticated)
 *
 * Removes the authenticated user's vote on a comment and decrements the
 * corresponding counter. No-ops silently when no vote exists (idempotent).
 *
 * Returns 200 + { comment: CommentWithDetails }
 */
export async function removeCommentVote(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { commentId } = req.params

    const comment: CommentWithDetails = await commentService.removeCommentVote(
      commentId,
      req.user.id,
    )

    res.status(200).json({ comment })
  } catch (err) {
    next(err)
  }
}
