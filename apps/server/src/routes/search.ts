import { Router } from 'express'
import { optionalAuth } from '../middleware/auth'
import { search } from '../controllers/searchController'

const router: Router = Router()

// GET /api/search?q=<query>&type=<all|users|posts|orgs>
// Auth optional — results are the same for all users; no personalisation applied.
router.get('/', optionalAuth, search)

export default router
