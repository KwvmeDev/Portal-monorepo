import { Router, type Router as ExpressRouter } from 'express'
import { prisma } from '../prisma/client'
import { redis } from '../config/redis'

const router: ExpressRouter = Router()

/**
 * GET /api/health
 *
 * Checks liveness of Postgres and Redis, returning 200 when both are healthy
 * or 503 with a "degraded" status when either dependency fails. Intended for
 * load-balancer / uptime-monitor probes.
 */
router.get('/', async (_req, res) => {
  const result: {
    status: 'ok' | 'degraded'
    db: 'connected' | 'error'
    redis: 'connected' | 'error'
    timestamp: string
    error?: string
  } = {
    status: 'ok',
    db: 'connected',
    redis: 'connected',
    timestamp: new Date().toISOString(),
  }

  // Check Postgres — a raw SELECT 1 is the lightest possible round-trip
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    result.status = 'degraded'
    result.db = 'error'
    result.error = err instanceof Error ? err.message : String(err)
  }

  // Check Redis — PING returns 'PONG' on success
  try {
    await redis.ping()
  } catch (err) {
    result.status = 'degraded'
    result.redis = 'error'
    // Preserve the first error message; don't overwrite a Postgres error if both fail
    if (!result.error) {
      result.error = err instanceof Error ? err.message : String(err)
    }
  }

  const statusCode = result.status === 'ok' ? 200 : 503
  res.status(statusCode).json(result)
})

export default router
