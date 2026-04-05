import { Router } from 'express'
import * as authController from '../controllers/authController'
import { authenticate } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimit'

const router: Router = Router()

router.post('/register', authLimiter, authController.register)
router.post('/verify-email', authLimiter, authController.verifyEmail)
router.post('/login', authLimiter, authController.login)
router.post('/refresh', authController.refresh)
router.delete('/logout', authController.logout)
router.post('/change-password', authenticate, authController.changePassword)
router.post('/forgot-password', authLimiter, authController.forgotPassword)
router.post('/reset-password', authLimiter, authController.resetPassword)
router.post('/check-otp', authLimiter, authController.checkOtp)
router.get('/check-username', authController.checkUsername)

export default router
