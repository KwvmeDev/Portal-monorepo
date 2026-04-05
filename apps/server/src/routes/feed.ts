import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as postController from '../controllers/postController'

/**
 * Feed routes — mounted at /api/feed in routes/index.ts
 *
 * All feed endpoints require authentication so the server can personalise
 * results (global: follows + org memberships; campus: university_id).
 */
const router: Router = Router()

// GET /api/feed/global?cursor=
// Returns hot-scored paginated feed from followed users + joined orgs.
// First page cached in Redis for 30 s per user.
router.get('/global', authenticate, postController.getGlobalFeed)

// GET /api/feed/campus?cursor=
// Returns hot-scored paginated feed for the user's university.
// Returns empty page + message when user has no university set.
router.get('/campus', authenticate, postController.getCampusFeed)

// GET /api/feed/org/:orgId?cursor=
// Returns hot-scored paginated feed for a specific org.
// invite_only orgs enforce an approved-membership gate.
router.get('/org/:orgId', authenticate, postController.getOrgFeed)

export default router
