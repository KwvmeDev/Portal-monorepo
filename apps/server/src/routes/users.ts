import { Router } from 'express'
import * as userController from '../controllers/userController'
import * as postController from '../controllers/postController'
import * as followController from '../controllers/followController'
import { authenticate, optionalAuth } from '../middleware/auth'

const router: Router = Router()

router.get('/me', authenticate, userController.getMe)
router.patch('/me', authenticate, userController.updateMe)
router.delete('/me', authenticate, userController.deleteMe)

// /universities must be declared before /:username to prevent the dynamic
// segment from swallowing the literal "universities" path.
router.get('/universities', userController.getUniversities)

// GET /api/users/:id/posts?cursor=
// Returns a user's posts in reverse chronological order with cursor pagination.
// Auth optional — viewer's vote state is included when authenticated.
// Declared before /:username to allow the more specific path to match first
// when the segment is a UUID (user IDs are UUIDs; usernames are alphanumeric).
router.get('/:id/posts', optionalAuth, postController.getUserPosts)

// Follow / social-graph routes — declared before /:username to prevent the
// dynamic segment swallowing paths like "/<uuid>/follow".
router.post('/:userId/follow', authenticate, followController.followUser)
router.delete('/:userId/follow', authenticate, followController.unfollowUser)
router.get('/:userId/followers', optionalAuth, followController.getFollowers)
router.get('/:userId/following', optionalAuth, followController.getFollowing)
router.get('/:userId/follow-stats', optionalAuth, followController.getFollowStats)

router.get('/:username', optionalAuth, userController.getProfile)

export default router
