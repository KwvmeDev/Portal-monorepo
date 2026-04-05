import { Request, Response, NextFunction } from 'express'
import { followService } from '../services/followService'
import { ApiError } from '../utils/ApiError'

// ─── followUser ───────────────────────────────────────────────────────────────

/**
 * POST /api/users/:userId/follow  (authenticated)
 *
 * Creates a follow relationship where the authenticated user follows :userId.
 * Returns 400 if the user tries to follow themselves.
 * Returns 409 if the relationship already exists.
 * Returns 201 with { followStats } on success.
 */
export async function followUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { userId } = req.params
    const followStats = await followService.followUser(req.user.id, userId)

    res.status(201).json({ followStats })
  } catch (err) {
    next(err)
  }
}

// ─── unfollowUser ─────────────────────────────────────────────────────────────

/**
 * DELETE /api/users/:userId/follow  (authenticated)
 *
 * Removes the follow relationship where the authenticated user follows :userId.
 * Returns 404 if no such relationship exists.
 * Returns 200 with { followStats } on success.
 */
export async function unfollowUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { userId } = req.params
    const followStats = await followService.unfollowUser(req.user.id, userId)

    res.status(200).json({ followStats })
  } catch (err) {
    next(err)
  }
}

// ─── getFollowers ─────────────────────────────────────────────────────────────

/**
 * GET /api/users/:userId/followers  (auth optional)
 *
 * Query: ?cursor=<ISO date string>
 *
 * Returns a paginated list of users who follow :userId.
 * Returns 200 with { users, nextCursor, hasMore }.
 */
export async function getFollowers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const result = await followService.getFollowers(userId, cursor)

    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ─── getFollowing ─────────────────────────────────────────────────────────────

/**
 * GET /api/users/:userId/following  (auth optional)
 *
 * Query: ?cursor=<ISO date string>
 *
 * Returns a paginated list of users that :userId is following.
 * Returns 200 with { users, nextCursor, hasMore }.
 */
export async function getFollowing(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const result = await followService.getFollowing(userId, cursor)

    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ─── getFollowStats ───────────────────────────────────────────────────────────

/**
 * GET /api/users/:userId/follow-stats  (auth optional)
 *
 * Returns follower count, following count, and whether the authenticated viewer
 * follows :userId. When unauthenticated, isFollowing is always false.
 * Returns 200 with { followStats }.
 */
export async function getFollowStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params
    // viewerId is undefined for unauthenticated requests — service handles this
    const viewerId = req.user?.id

    const followStats = await followService.getFollowStats(viewerId, userId)

    res.status(200).json({ followStats })
  } catch (err) {
    next(err)
  }
}
