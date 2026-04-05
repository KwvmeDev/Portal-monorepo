import { Router, type Router as ExpressRouter } from 'express'
import healthRouter from './health'
import authRouter from './auth'
import usersRouter from './users'
import mediaRouter from './media'
import postsRouter from './posts'
import feedRouter from './feed'
import pollsRouter from './polls'
import { postCommentRouter, commentRouter } from './comments'
import searchRouter from './search'
import orgsRouter from './orgs'
import notificationsRouter from './notifications'
import conversationsRouter from './conversations'
import pushTokensRouter from './push-tokens'
import reportsRouter from './reports'

/**
 * Root API router — aggregates all feature routers.
 * Mounted at '/api' in app.ts.
 */
const router: ExpressRouter = Router()

router.use('/health', healthRouter)
router.use('/auth', authRouter)
router.use('/users', usersRouter)
router.use('/media', mediaRouter)
router.use('/posts', postsRouter)
// postCommentRouter adds comment sub-routes on /posts/:postId/comments
// without replacing postsRouter — Express resolves both in registration order.
router.use('/posts', postCommentRouter)
router.use('/comments', commentRouter)
router.use('/feed', feedRouter)
router.use('/polls', pollsRouter)
router.use('/search', searchRouter)
router.use('/orgs', orgsRouter)
router.use('/notifications', notificationsRouter)
router.use('/conversations', conversationsRouter)
router.use('/push-tokens', pushTokensRouter)
router.use('/reports', reportsRouter)

export default router
