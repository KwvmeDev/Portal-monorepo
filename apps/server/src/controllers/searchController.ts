import { Request, Response, NextFunction } from 'express'
import { searchService } from '../services/searchService'
import { ApiError } from '../utils/ApiError'

/**
 * GET /api/search?q=<query>&type=<all|users|posts|orgs>  (auth optional)
 *
 * Query params:
 *   q    — Required search string (trimmed, must be non-empty)
 *   type — Optional filter; defaults to 'all' when omitted or unrecognised
 *
 * Returns { users, posts, orgs } — arrays are empty when type filters them out.
 */
export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) {
      return next(ApiError.badRequest('Query parameter "q" is required'))
    }

    const rawType = req.query.type
    const type: 'all' | 'users' | 'posts' | 'orgs' =
      rawType === 'users' || rawType === 'posts' || rawType === 'orgs' ? rawType : 'all'

    const results = await searchService.search(q, type)
    res.status(200).json(results)
  } catch (err) {
    next(err)
  }
}
