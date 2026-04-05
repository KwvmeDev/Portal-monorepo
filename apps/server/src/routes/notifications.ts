import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as notificationController from '../controllers/notificationController'

const router: Router = Router()

// GET /api/notifications?cursor=<id>
// Returns a paginated page of notifications for the authenticated user.
router.get('/', authenticate, notificationController.getNotifications)

// PATCH /api/notifications/read-all
// Must be registered BEFORE /:id/read so Express does not treat the literal
// segment "read-all" as a notification id parameter.
router.patch('/read-all', authenticate, notificationController.markAllAsRead)

// PATCH /api/notifications/:id/read
// Marks a single notification as read; 404 if not found or not owned by caller.
router.patch('/:id/read', authenticate, notificationController.markAsRead)

export default router
