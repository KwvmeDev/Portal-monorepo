import { Request, Response } from 'express'

/**
 * Catch-all handler for requests that did not match any registered route.
 * Must be mounted after all routers so it only fires on unmatched paths.
 */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'not_found',
    message: 'Route not found',
  })
}
