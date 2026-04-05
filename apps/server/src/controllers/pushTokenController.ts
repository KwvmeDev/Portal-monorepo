import { Request, Response, NextFunction } from 'express'
import { pushTokenService } from '../services/pushTokenService'
import { ApiError } from '../utils/ApiError'

// ─── registerToken ────────────────────────────────────────────────────────────

/**
 * POST /api/push-tokens  (authenticated)
 *
 * Body: { token: string }
 *
 * Registers (or silently re-registers) an Expo push token for the
 * authenticated user. Returns 204 on success.
 *
 * Returns 400 when the token field is absent or not a non-empty string.
 */
export async function registerToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { token } = req.body

    if (typeof token !== 'string' || token.trim() === '') {
      return next(ApiError.badRequest('token must be a non-empty string'))
    }

    await pushTokenService.upsertToken(req.user.id, token.trim())

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
