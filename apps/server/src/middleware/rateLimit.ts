import { Request, Response, NextFunction } from 'express'
import { redis } from '../config/redis'
import { ApiError } from '../utils/ApiError'

/**
 * Generic Redis INCR + EXPIRE rate limiter.
 *
 * On the very first request in a window (INCR returns 1) a TTL is set so the
 * key expires automatically when the window closes.  On every subsequent
 * request the counter is checked against the limit; if exceeded the handler
 * reads the remaining TTL and surfaces it as a Retry-After response header.
 *
 * @param key     - The Redis key to increment
 * @param limit   - Maximum allowed requests in the window
 * @param windowSeconds - Window size in seconds
 */
async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const count = await redis.incr(key)

  // Set TTL on the first request so the key self-expires after the window
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }

  if (count > limit) {
    // Return seconds remaining in the current window via Retry-After header
    const ttl = await redis.ttl(key)
    const retryAfter = ttl > 0 ? ttl : windowSeconds
    res.setHeader('Retry-After', String(retryAfter))
    return next(ApiError.tooManyRequests('Too many requests'))
  }

  next()
}

/**
 * Strict rate limiter for authentication endpoints (login, register, etc.).
 * Limit: 5 requests per 15 minutes, keyed by client IP.
 */
export async function authLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // req.ip can be undefined when Express is not bound to a socket (tests);
  // fall back to a generic string to avoid a broken Redis key.
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  const key = `ratelimit:auth:${ip}`
  const limit = 5
  const windowSeconds = 15 * 60 // 15 minutes

  await checkRateLimit(key, limit, windowSeconds, res, next)
}

/**
 * General API rate limiter for authenticated routes.
 * Limit: 100 requests per minute, keyed by userId when authenticated,
 * falling back to IP for unauthenticated callers.
 */
export async function apiLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const identifier = req.user?.id ?? req.ip ?? req.socket.remoteAddress ?? 'unknown'
  const key = `ratelimit:api:${identifier}`
  const limit = 100
  const windowSeconds = 60 // 1 minute

  await checkRateLimit(key, limit, windowSeconds, res, next)
}
