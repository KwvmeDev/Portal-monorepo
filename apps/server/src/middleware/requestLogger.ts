import morgan from 'morgan'
import { RequestHandler } from 'express'

/**
 * HTTP request logger middleware.
 * Uses morgan 'dev' format which outputs:
 *   METHOD /path STATUS response-time ms - bytes
 *
 * Example: GET /api/health 200 3.142 ms - 64
 *
 * morgan is preferred over manual logging so that response time and
 * status code are captured accurately after the response is sent.
 */
export const requestLogger: RequestHandler = morgan('dev')
