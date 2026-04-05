import { Router } from 'express'
import { authenticate, optionalAuth } from '../middleware/auth'
import * as postController from '../controllers/postController'

/**
 * Posts routes — mounted at /api/posts in routes/index.ts
 *
 * Route order matters: specific literal paths (/preview-link) must be
 * declared before dynamic segments (/:id) to prevent mis-routing.
 */
const router: Router = Router()

// ─── Link Preview ─────────────────────────────────────────────────────────────

// POST /api/posts/preview-link
// Fetches OG / meta tags for a given URL and returns a link preview object.
// Caches results in Redis for 24 h (keyed by SHA-256 hash of the URL).
router.post('/preview-link', authenticate, postController.previewLink)

// ─── Post CRUD ────────────────────────────────────────────────────────────────

// POST /api/posts
// Creates a new post for the authenticated user. Returns 201 with full post.
// TODO Sprint 8: AI moderation middleware runs inside the controller before DB write.
router.post('/', authenticate, postController.createPost)

// GET /api/posts/:id
// Returns full post details + viewer's vote state. Auth optional.
router.get('/:id', optionalAuth, postController.getPost)

// DELETE /api/posts/:id
// Soft-deletes a post (is_removed = true). Only author or super_admin allowed.
router.delete('/:id', authenticate, postController.deletePost)

// ─── Repost & Quote ───────────────────────────────────────────────────────────

// POST /api/posts/:id/repost
// Creates a simple repost (one per user per original post).
router.post('/:id/repost', authenticate, postController.repostPost)

// POST /api/posts/:id/quote
// Body: { content } — creates a quote post with the caller's commentary.
router.post('/:id/quote', authenticate, postController.quotePost)

// ─── Voting ───────────────────────────────────────────────────────────────────

// POST /api/posts/:id/vote
// Body: { value: 'up' | 'down' } — casts or toggles a vote.
router.post('/:id/vote', authenticate, postController.voteOnPost)

// DELETE /api/posts/:id/vote
// Removes the authenticated user's vote (idempotent).
router.delete('/:id/vote', authenticate, postController.removeVote)

export default router
