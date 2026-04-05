import { Request, Response, NextFunction } from 'express'
import { orgService } from '../services/orgService'
import { ApiError } from '../utils/ApiError'

// ─── listOrgs ─────────────────────────────────────────────────────────────────

/**
 * GET /api/orgs  (auth optional)
 *
 * Query: ?search=<string>&universityId=<uuid>&limit=<number>
 *
 * Returns a flat list of orgs matching the search. When universityId is
 * provided, university-affiliated orgs are surfaced first.
 */
export async function listOrgs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const universityId =
      typeof req.query.universityId === 'string' ? req.query.universityId : undefined
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 50) : 20
    const globalOnly = req.query.global === 'true'

    const orgs = await orgService.listOrgs(search, universityId, limit, globalOnly)

    res.status(200).json({ orgs })
  } catch (err) {
    next(err)
  }
}

// ─── getOrgProfile ────────────────────────────────────────────────────────────

/**
 * GET /api/orgs/:id  (auth optional)
 *
 * Returns the full org profile including memberCount, postCount, and the
 * authenticated viewer's membershipStatus. Guests receive membershipStatus 'none'.
 */
export async function getOrgProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    // req.user is undefined for unauthenticated requests (optionalAuth)
    const viewerUserId = req.user?.id

    const orgProfile = await orgService.getOrgProfile(id, viewerUserId)

    res.status(200).json({ orgProfile })
  } catch (err) {
    next(err)
  }
}

// ─── joinOrg ──────────────────────────────────────────────────────────────────

/**
 * POST /api/orgs/:id/join  (authenticated)
 *
 * Creates an OrgMembership for the authenticated user.
 * - open org  → membership is immediately approved
 * - invite_only org → membership is created with status='pending'
 *
 * Returns 409 if the user is already a member or has a pending request.
 */
export async function joinOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params
    await orgService.joinOrg(id, req.user.id)

    res.status(201).json({ message: 'Successfully joined organisation' })
  } catch (err) {
    next(err)
  }
}

// ─── leaveOrg ─────────────────────────────────────────────────────────────────

/**
 * DELETE /api/orgs/:id/leave  (authenticated)
 *
 * Removes the authenticated user's OrgMembership row.
 * Returns 404 if the user is not a member.
 */
export async function leaveOrg(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params
    await orgService.leaveOrg(id, req.user.id)

    res.status(200).json({ message: 'Successfully left organisation' })
  } catch (err) {
    next(err)
  }
}

// ─── getOrgMembers ────────────────────────────────────────────────────────────

/**
 * GET /api/orgs/:id/members  (auth optional)
 *
 * Query: ?cursor=<ISO date string>
 *
 * Returns a paginated list of approved org members ordered by joinedAt desc.
 * Page size is 20. Respond with { members, nextCursor }.
 */
export async function getOrgMembers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const result = await orgService.getOrgMembers(id, cursor)

    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ─── listChapters ─────────────────────────────────────────────────────────────

/**
 * GET /api/orgs/:id/chapters  (auth optional)
 *
 * Returns the chapter orgs for an umbrella org. Empty array if none.
 */
export async function listChapters(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    const chapters = await orgService.listChapters(id)
    res.status(200).json({ chapters })
  } catch (err) {
    next(err)
  }
}

// ─── getOrgFeed ───────────────────────────────────────────────────────────────

/**
 * GET /api/orgs/:id/feed  (auth optional)
 *
 * Query: ?cursor=<ISO date string>
 *
 * Returns paginated posts for the org ordered by createdAt desc.
 * Page size is 20. Authenticated viewers receive their vote state per post.
 */
export async function getOrgFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    const viewerUserId = req.user?.id

    const feedPage = await orgService.getOrgFeed(id, viewerUserId, cursor)

    res.status(200).json(feedPage)
  } catch (err) {
    next(err)
  }
}
