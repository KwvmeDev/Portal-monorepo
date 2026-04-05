import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'

/**
 * Global Express error handler — must be registered last (after all routes).
 * Handles four distinct error shapes:
 *   1. ApiError instances — use the built-in status and code
 *   2. ZodError — validation failure from request parsing
 *   3. Prisma P2002 — unique-constraint violation
 *   4. Everything else — generic 500
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // next is required as the 4th param so Express recognises this as an error handler
  _next: NextFunction,
): void {
  // 1. Known application errors with explicit status codes
  if (err instanceof ApiError) {
    console.warn(`[${err.statusCode}] ${err.code}: ${err.message}`)
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    })
    return
  }

  // 2. Zod validation errors
  if (
    err !== null &&
    typeof err === 'object' &&
    (err as { name?: string }).name === 'ZodError'
  ) {
    res.status(400).json({
      error: 'validation_error',
      errors: (err as { errors: unknown[] }).errors,
    })
    return
  }

  // 3. Prisma unique-constraint violation (code P2002)
  if (
    err !== null &&
    typeof err === 'object' &&
    (err as { code?: string }).code === 'P2002'
  ) {
    res.status(409).json({
      error: 'conflict',
      message: 'Resource already exists',
    })
    return
  }

  // 4. Unexpected errors — log full error server-side, return generic message
  console.error(err)
  res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong',
  })
}
