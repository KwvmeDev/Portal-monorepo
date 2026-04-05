import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as reportController from '../controllers/reportController'

const router: Router = Router()

// POST /api/reports
// Submit a report against a post, comment, or user.
// Requires authentication; any authenticated (non-banned) user may file a report.
router.post('/', authenticate, reportController.createReport)

// GET /api/reports?cursor=<id>&status=<status>
// List reports for the moderation dashboard. Super admin only.
router.get('/', authenticate, reportController.listReports)

// PATCH /api/reports/:id
// Resolve a report by approving (no action) or removing reported content.
// Super admin only.
router.patch('/:id', authenticate, reportController.resolveReport)

export default router
