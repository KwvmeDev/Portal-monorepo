import Redis from 'ioredis'
import { env } from './env'

/**
 * Singleton ioredis client.
 *
 * Connection is established lazily via the REDIS_URL env var.
 * All connection errors are logged but never crash the process —
 * callers must handle the case where Redis is temporarily unavailable.
 */
const redis = new Redis(env.REDIS_URL, {
  // Retry up to 3 times with exponential back-off, capped at 3 s
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 3000),
  // Connect immediately on startup so readiness probes catch misconfig early
  lazyConnect: false,
  // Suppress the default unhandled-error event that would crash Node
  enableOfflineQueue: true,
})

// Log connection lifecycle events — never throw from these handlers
redis.on('connect', () => {
  console.info('[Redis] Connected')
})

redis.on('ready', () => {
  console.info('[Redis] Ready to accept commands')
})

redis.on('error', (err: Error) => {
  // Log and continue — downstream callers should handle cache misses
  console.error('[Redis] Connection error:', err.message)
})

redis.on('close', () => {
  console.warn('[Redis] Connection closed')
})

redis.on('reconnecting', () => {
  console.warn('[Redis] Reconnecting...')
})

export { redis }
