import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as conversationController from '../controllers/conversationController'

const router: Router = Router()

// GET /api/conversations
// Returns all conversations for the authenticated user, ordered by lastMessageAt DESC.
router.get('/', authenticate, conversationController.getConversations)

// POST /api/conversations
// Body: { otherUserId: string }
// Returns { conversationId } for the existing or newly created conversation.
router.post('/', authenticate, conversationController.createConversation)

// GET /api/conversations/:id/messages?cursor=<id>
// Returns a paginated page of messages; marks unread messages from the other
// participant as read as a side-effect.
// Must be registered BEFORE /:id to avoid Express treating "messages" as an id.
router.get('/:id/messages', authenticate, conversationController.getMessages)

// POST /api/conversations/:id/messages
// Body: { content: string }
// Creates a new message in the conversation; returns 201 with MessageWithSender.
router.post('/:id/messages', authenticate, conversationController.sendMessage)

export default router
