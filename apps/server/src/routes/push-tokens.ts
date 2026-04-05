import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import * as pushTokenController from '../controllers/pushTokenController'

const pushTokensRouter: Router = Router()

// POST /api/push-tokens
// Registers an Expo push token for the authenticated user. Idempotent.
pushTokensRouter.post('/', authenticate, pushTokenController.registerToken)

export default pushTokensRouter
