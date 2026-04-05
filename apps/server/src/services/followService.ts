import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import { notificationService } from './notificationService'
import type { FollowStats, UserSummary } from '@portal/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ─── Return Types ─────────────────────────────────────────────────────────────

export interface FollowListPage {
  users: UserSummary[]
  nextCursor: string | null
  hasMore: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shared user field selection for followers/following list queries.
 * Maps to the UserSummary shape from @portal/types.
 */
const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  universityId: true,
} as const

// ─── Follow Service ───────────────────────────────────────────────────────────

export const followService = {
  /**
   * Creates a Follow record from followerId → followingId.
   *
   * Throws 400 when a user attempts to follow themselves.
   * Throws 409 when the follow relationship already exists (Prisma P2002).
   * Returns updated FollowStats for the followerId / targetUserId pair.
   */
  async followUser(followerId: string, followingId: string): Promise<FollowStats> {
    if (followerId === followingId) {
      throw ApiError.badRequest('You cannot follow yourself')
    }

    try {
      await prisma.follow.create({
        data: { followerId, followingId },
      })
    } catch (err: unknown) {
      // Prisma unique constraint violation — relationship already exists
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw ApiError.conflict('Already following this user')
      }
      throw err
    }

    // Fire-and-forget — notification failure must not roll back the follow
    void notificationService.createNotification({
      recipientId: followingId,
      type: 'follow',
      actorId: followerId,
      targetId: followerId,
      targetType: 'user',
    })

    return followService.getFollowStats(followerId, followingId)
  },

  /**
   * Deletes the Follow record for followerId → followingId.
   *
   * Throws 404 when the follow relationship does not exist (Prisma P2025).
   * Returns updated FollowStats for the followerId / targetUserId pair.
   */
  async unfollowUser(followerId: string, followingId: string): Promise<FollowStats> {
    try {
      await prisma.follow.delete({
        where: {
          followerId_followingId: { followerId, followingId },
        },
      })
    } catch (err: unknown) {
      // Prisma record-not-found — follow relationship does not exist
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === 'P2025'
      ) {
        throw ApiError.notFound('Not following this user')
      }
      throw err
    }

    return followService.getFollowStats(followerId, followingId)
  },

  /**
   * Returns a paginated list of users who follow the given userId.
   *
   * Ordered by follow.createdAt DESC (most recent followers first).
   * Cursor is the ISO string of the last item's createdAt — used to fetch
   * the next page. Fetches PAGE_SIZE + 1 rows to determine hasMore.
   */
  async getFollowers(userId: string, cursor?: string): Promise<FollowListPage> {
    const cursorDate = cursor ? new Date(cursor) : undefined

    const follows = await prisma.follow.findMany({
      where: {
        followingId: userId,
        // Cursor pagination on createdAt DESC — fetch records older than cursor
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      include: {
        follower: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    })

    const hasMore = follows.length > PAGE_SIZE
    const pageItems = follows.slice(0, PAGE_SIZE)

    const users: UserSummary[] = pageItems.map((f) => ({
      id: f.follower.id,
      username: f.follower.username,
      displayName: f.follower.displayName,
      avatarUrl: f.follower.avatarUrl,
      bio: f.follower.bio,
      universityId: f.follower.universityId,
    }))

    // Next cursor is the createdAt of the last item in this page
    const lastItem = pageItems[pageItems.length - 1]
    const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null

    return { users, nextCursor, hasMore }
  },

  /**
   * Returns a paginated list of users that the given userId is following.
   *
   * Ordered by follow.createdAt DESC (most recently followed first).
   * Cursor is the ISO string of the last item's createdAt.
   */
  async getFollowing(userId: string, cursor?: string): Promise<FollowListPage> {
    const cursorDate = cursor ? new Date(cursor) : undefined

    const follows = await prisma.follow.findMany({
      where: {
        followerId: userId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      include: {
        following: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    })

    const hasMore = follows.length > PAGE_SIZE
    const pageItems = follows.slice(0, PAGE_SIZE)

    const users: UserSummary[] = pageItems.map((f) => ({
      id: f.following.id,
      username: f.following.username,
      displayName: f.following.displayName,
      avatarUrl: f.following.avatarUrl,
      bio: f.following.bio,
      universityId: f.following.universityId,
    }))

    const lastItem = pageItems[pageItems.length - 1]
    const nextCursor = hasMore && lastItem ? lastItem.createdAt.toISOString() : null

    return { users, nextCursor, hasMore }
  },

  /**
   * Returns follow statistics for targetUserId from the perspective of viewerId.
   *
   * Executes three queries in parallel:
   *   - followers count (how many people follow targetUserId)
   *   - following count (how many people targetUserId follows)
   *   - isFollowing (does viewerId follow targetUserId)
   *
   * When viewerId is undefined (unauthenticated), isFollowing is always false.
   */
  async getFollowStats(viewerId: string | undefined, targetUserId: string): Promise<FollowStats> {
    const [followersCount, followingCount, followRecord] = await Promise.all([
      prisma.follow.count({ where: { followingId: targetUserId } }),
      prisma.follow.count({ where: { followerId: targetUserId } }),
      // Only query the follow record when there is an authenticated viewer
      viewerId
        ? prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewerId,
                followingId: targetUserId,
              },
            },
            select: { followerId: true },
          })
        : Promise.resolve(null),
    ])

    return {
      followersCount,
      followingCount,
      isFollowing: followRecord !== null,
    }
  },
}
