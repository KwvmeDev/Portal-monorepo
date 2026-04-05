import { Router } from 'express'
import { authenticate, optionalAuth } from '../middleware/auth'
import * as commentController from '../controllers/commentController'

/**
 * postCommentRouter — mounted at /api/posts in routes/index.ts
 *
 * Adds comment sub-routes on top of the existing postsRouter without
 * interfering with it. Express resolves both routers in registration order.
 */
export const postCommentRouter: Router = Router()

// POST /api/posts/:postId/comments
// Body: { content, parentId? } — creates a comment on the given post.
postCommentRouter.post('/:postId/comments', authenticate, commentController.createComment)

// GET /api/posts/:postId/comments
// Query: ?cursor= — paginated comment list with inline replies. Auth optional.
postCommentRouter.get('/:postId/comments', optionalAuth, commentController.getComments)

/**
 * commentRouter — mounted at /api/comments in routes/index.ts
 *
 * Handles comment-level operations that do not require a postId in the path.
 */
export const commentRouter: Router = Router()

// DELETE /api/comments/:commentId
// Soft-deletes a comment. Requester must be author, moderator, or admin.
commentRouter.delete('/:commentId', authenticate, commentController.deleteComment)

// POST /api/comments/:commentId/vote
// Body: { value: 'up' | 'down' } — casts or toggles a vote on a comment.
commentRouter.post('/:commentId/vote', authenticate, commentController.voteOnComment)

// DELETE /api/comments/:commentId/vote
// Removes the authenticated user's vote on a comment (idempotent).
commentRouter.delete('/:commentId/vote', authenticate, commentController.removeCommentVote)
