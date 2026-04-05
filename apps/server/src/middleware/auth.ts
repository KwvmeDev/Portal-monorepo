import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'

// Extend Express Request to carry the authenticated user payload
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: string
        isBanned: boolean
      }
    }
  }
}

interface JwtPayload {
  userId: string
  role: string
  iat?: number
  exp?: number
}

/**
 * Verifies the Authorization: Bearer <token> header, fetches the user from
 * the database to confirm current ban/role state, and attaches req.user.
 *
 * Throws 401 if the header is missing or the token is invalid/expired.
 * Throws 403 with code 'account_banned' if the user is banned.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Authentication token required'))
  }

  const token = authHeader.slice(7) // strip "Bearer " prefix

  let payload: JwtPayload

  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
  } catch {
    // Covers TokenExpiredError, JsonWebTokenError, NotBeforeError
    return next(ApiError.unauthorized('Invalid or expired token'))
  }

  // Re-fetch from DB to get the current ban status and role — the token
  // snapshot may be stale if a moderator updated these fields after issuance.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isBanned: true, banReason: true },
  })

  if (!user) {
    return next(ApiError.unauthorized('User not found'))
  }

  if (user.isBanned) {
    const reason = user.banReason ?? 'No reason provided'
    return next(
      new ApiError(
        `Account banned: ${reason}`,
        403,
        'account_banned',
      ),
    )
  }

  req.user = { id: user.id, role: user.role, isBanned: user.isBanned }
  next()
}

/**
 * Factory that returns a middleware enforcing role-based access.
 * Must be used after authenticate (req.user must be set).
 *
 * Throws 403 if the authenticated user's role is not in the allowed list.
 */
export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden('You do not have permission to access this resource'),
      )
    }

    next()
  }
}

/**
 * Like authenticate but non-blocking — attaches req.user if a valid token
 * is present, otherwise silently continues. Useful for routes that render
 * differently for guests vs. authenticated users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization

  // No token — proceed as guest
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next()
  }

  const token = authHeader.slice(7)

  let payload: JwtPayload

  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload
  } catch {
    // Invalid/expired token — treat as unauthenticated, do not error
    return next()
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isBanned: true },
  })

  // If user deleted or banned, continue as guest rather than surfacing an error
  if (user && !user.isBanned) {
    req.user = { id: user.id, role: user.role, isBanned: user.isBanned }
  }

  next()
}
