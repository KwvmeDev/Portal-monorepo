import { prisma } from '../prisma/client'
import { redis } from '../config/redis'
import { ApiError } from '../utils/ApiError'
import type { PostWithDetails, FeedPage, FeedCursor, RepostOrigin } from '@portal/types'
import type { ContentType } from '@prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

/** How many posts to fetch from DB before in-memory hot-score sorting. */
const FETCH_WINDOW = 100

/** Redis TTL for the global feed cache, in seconds. */
const GLOBAL_FEED_CACHE_TTL_S = 30

// ─── Projection shapes ────────────────────────────────────────────────────────

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const

const ORG_SELECT = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} as const

// ─── Internal types ───────────────────────────────────────────────────────────

/** Raw Prisma post row returned by feed queries (before mapping). */
interface RawPost {
  id: string
  authorId: string
  content: string | null
  contentType: ContentType
  mediaUrls: unknown
  linkUrl: string | null
  linkPreview: unknown
  pollId: string | null
  poll: { id: string; question: string; options: unknown; endsAt: Date } | null
  orgId: string | null
  universityId: string | null
  repostOfId: string | null
  quoteOfId: string | null
  quoteContent: string | null
  upvotes: number
  downvotes: number
  commentCount: number
  repostCount: number
  isPinned: boolean
  isRemoved: boolean
  createdAt: Date
  updatedAt: Date
  author: { id: string; username: string; displayName: string; avatarUrl: string | null }
  org: { id: string; name: string; handle: string; avatarUrl: string | null } | null
  repostOf: {
    id: string
    content: string | null
    contentType: ContentType
    createdAt: Date
    mediaUrls: unknown
    author: { id: string; username: string; displayName: string; avatarUrl: string | null }
  } | null
}

/** Decoded cursor payload carried between pages. */
interface CursorPayload {
  hotScore: number
  id: string
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Reddit-style hot score algorithm.
 * Pure function — no side effects, deterministic output.
 *
 * Balances vote magnitude (log scale) with post age so recent posts with
 * fewer votes can still compete against older posts with many votes.
 */
export function hotScore(upvotes: number, downvotes: number, createdAt: Date): number {
  const score = upvotes - downvotes
  const order = Math.log10(Math.max(Math.abs(score), 1))
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0
  // Epoch offset matches the original Reddit algorithm (Dec 8, 2005)
  const seconds = (createdAt.getTime() / 1000) - 1134028003
  return sign * order + seconds / 45000
}

/**
 * Encodes a cursor payload as a URL-safe base64 JSON string.
 * The cursor must be opaque to callers — only the server decodes it.
 */
function encodeCursor(payload: CursorPayload): FeedCursor {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

/**
 * Decodes an incoming base64 cursor string.
 * Returns null (rather than throwing) when the cursor is malformed so callers
 * can treat a bad cursor as "start from beginning".
 */
function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CursorPayload).hotScore === 'number' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload
    }
    return null
  } catch {
    return null
  }
}

/**
 * Builds the include clause used by every feed query to eager-load relations.
 * Keeping this centralised ensures all feed paths return the same shape.
 */
function buildPostInclude() {
  return {
    author: { select: AUTHOR_SELECT },
    org: { select: ORG_SELECT },
    poll: {
      select: { id: true, question: true, options: true, endsAt: true },
    },
    // Piggyback the original post data so repost cards can render without a
    // second round-trip. Prisma returns null here when repostOfId is null.
    repostOf: {
      select: {
        id: true,
        content: true,
        contentType: true,
        createdAt: true,
        mediaUrls: true,
        author: { select: AUTHOR_SELECT },
      },
    },
  } as const
}

/**
 * Looks up the viewer's votes for a batch of posts in a single DB query,
 * then returns a map of postId → vote value.
 *
 * Avoids N+1 queries that would result from fetching votes per post.
 */
async function batchFetchUserVotes(
  postIds: string[],
  userId: string,
): Promise<Map<string, 'up' | 'down'>> {
  if (postIds.length === 0) return new Map()

  const votes = await prisma.vote.findMany({
    where: {
      userId,
      targetId: { in: postIds },
      targetType: 'post',
    },
    select: { targetId: true, value: true },
  })

  return new Map(votes.map((v) => [v.targetId, v.value as 'up' | 'down']))
}

/**
 * Maps a raw Prisma post row into the PostWithDetails wire shape.
 * Pure transformation — no DB access.
 */
function toPostWithDetails(
  raw: RawPost,
  userVote: 'up' | 'down' | null,
  followedAuthorIds: Set<string>,
): PostWithDetails {
  return {
    id: raw.id,
    authorId: raw.authorId,
    content: raw.content,
    contentType: raw.contentType as PostWithDetails['contentType'],
    mediaUrls: (raw.mediaUrls as string[]) ?? [],
    linkUrl: raw.linkUrl,
    linkPreview: (raw.linkPreview as PostWithDetails['linkPreview']) ?? null,
    pollId: raw.pollId,
    pollData: raw.poll
      ? {
          id: raw.poll.id,
          question: raw.poll.question,
          options: raw.poll.options as PostWithDetails['pollData'] extends { options: infer O }
            ? O
            : never,
          endsAt: raw.poll.endsAt.toISOString(),
        }
      : null,
    orgId: raw.orgId,
    universityId: raw.universityId,
    repostOfId: raw.repostOfId,
    quoteOfId: raw.quoteOfId,
    quoteContent: raw.quoteContent,
    upvotes: raw.upvotes,
    downvotes: raw.downvotes,
    commentCount: raw.commentCount,
    repostCount: raw.repostCount,
    isPinned: raw.isPinned,
    isRemoved: raw.isRemoved,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    author: raw.author,
    org: raw.org,
    userVote,
    viewerFollowsAuthor: followedAuthorIds.has(raw.authorId),
    // Convert createdAt to ISO string; null propagates as-is for non-reposts.
    repostOf: raw.repostOf
      ? ({
          id: raw.repostOf.id,
          content: raw.repostOf.content,
          contentType: raw.repostOf.contentType as RepostOrigin['contentType'],
          createdAt: raw.repostOf.createdAt.toISOString(),
          mediaUrls: (raw.repostOf.mediaUrls as string[]) ?? [],
          author: raw.repostOf.author,
        } satisfies RepostOrigin)
      : null,
  }
}

/**
 * Core pagination engine shared by all feed types.
 *
 * Receives a pre-fetched raw post list and:
 * 1. Attaches a hot score to each post
 * 2. Sorts by hot score DESC (stable tie-break on id ASC)
 * 3. Applies cursor filtering to skip posts already seen
 * 4. Slices to PAGE_SIZE + 1 to determine hasMore
 * 5. Batch-fetches user votes and maps to PostWithDetails
 * 6. Returns a FeedPage with the next cursor
 *
 * Pinned posts (if any) are expected to arrive pre-separated and are
 * prepended after pagination — see getOrgFeed.
 */
async function paginatePosts(
  rawPosts: RawPost[],
  userId: string | null,
  cursor: FeedCursor | undefined,
): Promise<FeedPage> {
  // Attach computed hot score so we can sort without touching the DB again.
  const scored = rawPosts.map((post) => ({
    post,
    score: hotScore(post.upvotes, post.downvotes, post.createdAt),
  }))

  // Sort by hot score DESC; use id as a stable tie-breaker so the order is
  // deterministic across pages when two posts share the same score.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.post.id < b.post.id ? -1 : 1
  })

  // Decode the incoming cursor so we know where the previous page ended.
  const decodedCursor = cursor ? decodeCursor(cursor) : null

  // Drop posts that appear at or before the cursor position in the sorted list.
  // The cursor encodes both score and id so we handle ties correctly.
  const afterCursor = decodedCursor
    ? scored.filter(({ score, post }) => {
        if (score < decodedCursor.hotScore) return true
        if (score === decodedCursor.hotScore && post.id > decodedCursor.id) return true
        return false
      })
    : scored

  // Fetch one extra post to determine whether more pages exist.
  const pageSlice = afterCursor.slice(0, PAGE_SIZE + 1)
  const hasMore = pageSlice.length > PAGE_SIZE
  const pageItems = pageSlice.slice(0, PAGE_SIZE)

  // Batch-fetch the viewer's votes and follows for all posts on this page.
  const postIds = pageItems.map(({ post }) => post.id)
  const authorIds = [...new Set(pageItems.map(({ post }) => post.authorId))]

  const [voteMap, followedRows] = await Promise.all([
    userId ? batchFetchUserVotes(postIds, userId) : Promise.resolve(new Map<string, 'up' | 'down'>()),
    userId
      ? prisma.follow.findMany({
          where: { followerId: userId, followingId: { in: authorIds } },
          select: { followingId: true },
        })
      : Promise.resolve([] as { followingId: string }[]),
  ])

  const followedAuthorIds = new Set(followedRows.map((r) => r.followingId))

  const posts = pageItems.map(({ post }) =>
    toPostWithDetails(post, voteMap.get(post.id) ?? null, followedAuthorIds),
  )

  // Build the next cursor from the last item's score and id.
  const lastItem = pageItems[pageItems.length - 1]
  const nextCursor =
    hasMore && lastItem ? encodeCursor({ hotScore: lastItem.score, id: lastItem.post.id }) : null

  return { posts, nextCursor, hasMore }
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

function globalFeedCacheKey(userId: string): string {
  return `feed:global:${userId}`
}

/**
 * Reads a cached FeedPage from Redis.
 * Returns null on cache miss or any Redis error — callers fall through to DB.
 */
async function readGlobalFeedCache(userId: string): Promise<FeedPage | null> {
  try {
    const raw = await redis.get(globalFeedCacheKey(userId))
    if (!raw) return null
    return JSON.parse(raw) as FeedPage
  } catch {
    // Redis unavailability must never break the feed — degrade gracefully.
    return null
  }
}

/**
 * Writes a FeedPage to Redis with the configured TTL.
 * Errors are swallowed — a failed cache write must never fail the request.
 */
async function writeGlobalFeedCache(userId: string, page: FeedPage): Promise<void> {
  try {
    await redis.set(globalFeedCacheKey(userId), JSON.stringify(page), 'EX', GLOBAL_FEED_CACHE_TTL_S)
  } catch {
    // Swallow — cache write failure is non-fatal.
  }
}

// ─── Feed Service ─────────────────────────────────────────────────────────────

export const feedService = {
  /**
   * Global feed: posts from accounts the user follows + orgs the user is an
   * approved member of.
   *
   * Result is cached in Redis per userId for GLOBAL_FEED_CACHE_TTL_S seconds.
   * Only the first page (no cursor) is cached; subsequent pages are always
   * fetched live because cursor values change per session.
   */
  async getGlobalFeed(userId: string, cursor?: FeedCursor): Promise<FeedPage> {
    // Cache only the first page (cursor-less requests) to avoid caching
    // mid-scroll pages which are user-session-specific.
    const shouldUseCache = !cursor
    if (shouldUseCache) {
      const cached = await readGlobalFeedCache(userId)
      if (cached) return cached
    }

    // Resolve the set of user IDs the viewer follows and org IDs they belong to.
    const [follows, memberships] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      prisma.orgMembership.findMany({
        where: { userId, status: 'approved' },
        select: { orgId: true },
      }),
    ])

    const followedUserIds = follows.map((f) => f.followingId)
    const memberOrgIds = memberships.map((m) => m.orgId)

    // Fetch a wide window so the in-memory sort produces a representative page.
    const rawPosts = (await prisma.post.findMany({
      where: {
        isRemoved: false,
        author: { isBanned: false },
        OR: [
          // Always include the viewer's own posts
          { authorId: userId },
          // Posts from followed users
          { authorId: { in: followedUserIds } },
          // Posts from orgs the user is a member of
          { orgId: { in: memberOrgIds } },
        ],
      },
      include: buildPostInclude(),
      orderBy: { createdAt: 'desc' },
      take: FETCH_WINDOW,
    })) as unknown as RawPost[]

    const page = await paginatePosts(rawPosts, userId, cursor)

    if (shouldUseCache) {
      await writeGlobalFeedCache(userId, page)
    }

    return page
  },

  /**
   * Campus feed: posts where university_id matches the viewer's university.
   *
   * Returns an empty page with a descriptive message when the viewer has no
   * university set — avoids returning every university's posts by mistake.
   */
  async getCampusFeed(userId: string, cursor?: FeedCursor): Promise<FeedPage & { message?: string }> {
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { universityId: true },
    })

    if (!viewer) {
      throw ApiError.notFound('User not found')
    }

    // User has not set a university — return an empty result with a message
    // rather than an error so the UI can display a helpful prompt.
    if (!viewer.universityId) {
      return {
        posts: [],
        nextCursor: null,
        hasMore: false,
        message: 'Set your university in your profile to see your campus feed.',
      }
    }

    const rawPosts = (await prisma.post.findMany({
      where: {
        universityId: viewer.universityId,
        isRemoved: false,
        author: { isBanned: false },
      },
      include: buildPostInclude(),
      orderBy: { createdAt: 'desc' },
      take: FETCH_WINDOW,
    })) as unknown as RawPost[]

    return paginatePosts(rawPosts, userId, cursor)
  },

  /**
   * Org feed: all posts for a given org, with pinned posts always first and
   * the rest sorted by hot score.
   *
   * Access control:
   * - open orgs: anyone can view
   * - invite_only orgs: viewer must be an approved member
   */
  async getOrgFeed(orgId: string, userId: string, cursor?: FeedCursor): Promise<FeedPage> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, visibility: true },
    })

    if (!org) {
      throw ApiError.notFound('Organisation not found')
    }

    // Enforce membership gate for non-open orgs.
    if (org.visibility !== 'open') {
      const membership = await prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId, orgId } },
        select: { status: true },
      })

      const isApprovedMember = membership?.status === 'approved'
      if (!isApprovedMember) {
        throw ApiError.forbidden('You must be an approved member to view this org feed')
      }
    }

    // Fetch pinned and non-pinned posts separately so pinned posts always
    // appear at the top regardless of their hot score.
    const [pinnedRaw, unpinnedRaw] = await Promise.all([
      prisma.post.findMany({
        where: {
          orgId,
          isPinned: true,
          isRemoved: false,
          author: { isBanned: false },
        },
        include: buildPostInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.post.findMany({
        where: {
          orgId,
          isPinned: false,
          isRemoved: false,
          author: { isBanned: false },
        },
        include: buildPostInclude(),
        orderBy: { createdAt: 'desc' },
        take: FETCH_WINDOW,
      }),
    ]) as unknown as [RawPost[], RawPost[]]

    // Paginate only the non-pinned posts via hot score.
    // Pinned posts are prepended unconditionally on every page so they are
    // always visible — this matches the behaviour of most social platforms.
    const unpinnedPage = await paginatePosts(unpinnedRaw, userId, cursor)

    // Batch-fetch votes + follows for pinned posts separately.
    const pinnedIds = pinnedRaw.map((p) => p.id)
    const pinnedAuthorIds = [...new Set(pinnedRaw.map((p) => p.authorId))]
    const [pinnedVoteMap, pinnedFollowedRows] = await Promise.all([
      batchFetchUserVotes(pinnedIds, userId),
      userId
        ? prisma.follow.findMany({
            where: { followerId: userId, followingId: { in: pinnedAuthorIds } },
            select: { followingId: true },
          })
        : Promise.resolve([] as { followingId: string }[]),
    ])
    const pinnedFollowedIds = new Set(pinnedFollowedRows.map((r) => r.followingId))

    const pinnedPosts = pinnedRaw.map((p) =>
      toPostWithDetails(p, pinnedVoteMap.get(p.id) ?? null, pinnedFollowedIds),
    )

    // Only prepend pinned posts on the first page to avoid duplicating them
    // across pages. Cursor presence signals we're on a subsequent page.
    const posts = cursor ? unpinnedPage.posts : [...pinnedPosts, ...unpinnedPage.posts]

    return {
      posts,
      nextCursor: unpinnedPage.nextCursor,
      hasMore: unpinnedPage.hasMore,
    }
  },
}
