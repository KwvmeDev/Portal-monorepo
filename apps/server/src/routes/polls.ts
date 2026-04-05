import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as postController from '../controllers/postController'

/**
 * Poll routes — mounted at /api/polls in routes/index.ts
 */
const router: Router = Router()

// POST /api/polls/:id/vote
// Body: { optionId }
// Casts a vote on a poll option. Checks poll not expired and no duplicate vote.
// Increments option voteCount in JSONB and inserts poll_vote record atomically.
router.post('/:id/vote', authenticate, postController.votePoll)

export default router
