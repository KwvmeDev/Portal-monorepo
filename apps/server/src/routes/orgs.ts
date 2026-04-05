import { Router } from 'express'
import * as orgController from '../controllers/orgController'
import { authenticate, optionalAuth } from '../middleware/auth'

/**
 * Org routes — mounted at /api/orgs in routes/index.ts
 *
 * GET    /api/orgs/:id          — org profile (auth optional)
 * POST   /api/orgs/:id/join     — join org (auth required)
 * DELETE /api/orgs/:id/leave    — leave org (auth required)
 * GET    /api/orgs/:id/members  — paginated member list (auth optional)
 * GET    /api/orgs/:id/feed     — paginated org post feed (auth optional)
 */
const router: Router = Router()

// GET / must be declared before /:id so Express doesn't treat the literal
// empty path as the :id segment.
router.get('/', optionalAuth, orgController.listOrgs)

// Specific sub-paths must be declared before the bare /:id route so Express
// does not swallow them as the dynamic :id segment.
router.get('/:id/chapters', optionalAuth, orgController.listChapters)
router.post('/:id/join', authenticate, orgController.joinOrg)
router.delete('/:id/leave', authenticate, orgController.leaveOrg)
router.get('/:id/members', optionalAuth, orgController.getOrgMembers)
router.get('/:id/feed', optionalAuth, orgController.getOrgFeed)
router.get('/:id', optionalAuth, orgController.getOrgProfile)

export default router
