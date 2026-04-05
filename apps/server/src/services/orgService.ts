import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import type { OrgProfile, OrgMember, PostWithDetails, FeedPage } from '@portal/types'
import type { ContentType } from '@prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

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

/** Raw Prisma post row shape before mapping to PostWithDetails. */
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
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Maps a raw Prisma post row to the PostWithDetails wire shape.
 * Pure transformation — no DB access.
 */
function toPostWithDetails(raw: RawPost, userVote: 'up' | 'down' | null): PostWithDetails {
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
    viewerFollowsAuthor: false,
  }
}

/**
 * Builds the post include clause used by org feed queries.
 * Mirrors the same shape used across feedService and searchService.
 */
function buildPostInclude() {
  return {
    author: { select: AUTHOR_SELECT },
    org: { select: ORG_SELECT },
    poll: { select: { id: true, question: true, options: true, endsAt: true } },
  } as const
}

/**
 * Batch-fetches the viewer's vote values for a set of post IDs in one query.
 * Returns an empty map when no userId is supplied (unauthenticated request).
 */
async function batchFetchUserVotes(
  postIds: string[],
  userId: string,
): Promise<Map<string, 'up' | 'down'>> {
  if (postIds.length === 0) return new Map()

  const votes = await prisma.vote.findMany({
    where: { userId, targetId: { in: postIds }, targetType: 'post' },
    select: { targetId: true, value: true },
  })

  return new Map(votes.map((v) => [v.targetId, v.value as 'up' | 'down']))
}

/**
 * Derives the viewer's membership status for an org.
 *
 * OrgJoinRequest does not exist in the schema, so 'pending' is returned when
 * an OrgMembership row exists with status = 'pending' (set when org is
 * invite_only and a row was created via a request workflow).
 *
 * Mapping:
 *   No row           → 'none'
 *   status=pending   → 'pending'
 *   role=admin/mod   → 'admin'  (moderator is surfaced as admin to callers)
 *   role=member      → 'member'
 */
function deriveMembershipStatus(
  membership: { role: string; status: string } | null,
): OrgProfile['membershipStatus'] {
  if (!membership) return 'none'
  if (membership.status === 'pending') return 'pending'
  // Treat moderator same as admin for client-facing API
  if (membership.role === 'admin' || membership.role === 'moderator') return 'admin'
  return 'member'
}

// ─── Org Service ──────────────────────────────────────────────────────────────

export const orgService = {
  /**
   * Returns a list of organisations matching an optional search query.
   *
   * When universityId is supplied, results affiliated with that university are
   * returned first (ORDER BY CASE … END, name). Falls back to a global list.
   * Limit defaults to 20.
   */
  async listOrgs(
    search?: string,
    universityId?: string,
    limit = 20,
    globalOnly = false,
  ): Promise<{ id: string; name: string; handle: string; avatarUrl: string | null; type: string; visibility: string; memberCount: number }[]> {
    const rows = await prisma.organization.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { handle: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        // globalOnly=true returns only umbrella orgs (no universityId, no parentOrgId)
        ...(globalOnly ? { universityId: null, parentOrgId: null } : {}),
      },
      include: {
        _count: { select: { memberships: true } },
      },
      orderBy: universityId
        ? [
            // University-affiliated orgs sort first; raw SQL not needed — we sort in JS
            { name: 'asc' },
          ]
        : [{ name: 'asc' }],
      take: limit,
    })

    // Surface university-affiliated orgs first when universityId is provided
    const sorted = universityId
      ? [
          ...rows.filter((r) => r.universityId === universityId),
          ...rows.filter((r) => r.universityId !== universityId),
        ]
      : rows

    return sorted.map((r) => ({
      id: r.id,
      name: r.name,
      handle: r.handle,
      avatarUrl: r.avatarUrl,
      type: r.type,
      visibility: r.visibility,
      memberCount: r._count.memberships,
    }))
  },


  /**
   * Returns the full org profile for a given org ID.
   *
   * Includes member/post counts and the viewer's membership status.
   * viewerUserId may be undefined for unauthenticated callers — they always
   * receive membershipStatus: 'none'.
   *
   * Throws 404 when the org does not exist.
   */
  async getOrgProfile(orgId: string, viewerUserId?: string): Promise<OrgProfile> {
    const [org, membership] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          _count: { select: { memberships: true, posts: true, chapters: true } },
          parent: { select: { id: true, name: true, handle: true } },
        },
      }),
      viewerUserId
        ? prisma.orgMembership.findUnique({
            where: { userId_orgId: { userId: viewerUserId, orgId } },
            select: { role: true, status: true },
          })
        : Promise.resolve(null),
    ])

    if (!org) {
      throw ApiError.notFound('Organisation not found')
    }

    return {
      id: org.id,
      name: org.name,
      handle: org.handle,
      avatarUrl: org.avatarUrl,
      bannerUrl: org.bannerUrl,
      description: org.description,
      type: org.type as OrgProfile['type'],
      visibility: org.visibility as OrgProfile['visibility'],
      universityId: org.universityId,
      parentOrgId: org.parentOrgId,
      parentOrg: org.parent ?? null,
      memberCount: org._count.memberships,
      postCount: org._count.posts,
      chapterCount: org._count.chapters,
      isPublic: org.visibility === 'open',
      membershipStatus: deriveMembershipStatus(membership),
    }
  },

  /**
   * Joins an org on behalf of userId.
   *
   * - open org: creates an OrgMembership with role='member', status='approved'
   * - invite_only org: creates an OrgMembership with status='pending' (join request)
   *
   * Throws 404 when the org does not exist.
   * Throws 409 when the user is already a member or has a pending request.
   */
  async joinOrg(orgId: string, userId: string): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, visibility: true, universityId: true, parentOrgId: true },
    })

    if (!org) {
      throw ApiError.notFound('Organisation not found')
    }

    // Check for existing membership (any status) to detect duplicates
    const existing = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { status: true },
    })

    if (existing) {
      const detail =
        existing.status === 'pending'
          ? 'Join request already pending'
          : 'Already a member of this organisation'
      throw ApiError.conflict(detail)
    }

    const isOpen = org.visibility === 'open'

    await prisma.orgMembership.create({
      data: {
        userId,
        orgId,
        role: 'member',
        status: isOpen ? 'approved' : 'pending',
      },
    })

    // ── Cascade-down: joining a global/umbrella org auto-joins the user's
    // university chapter (Option C). Only applies when:
    //   - The joined org has no universityId (it's a global umbrella)
    //   - The user has a universityId set on their profile
    // Errors here are swallowed so they never fail the primary join.
    const isUmbrella = !org.universityId
    if (isUmbrella) {
      void (async () => {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { universityId: true },
          })
          if (!user?.universityId) return

          const chapter = await prisma.organization.findFirst({
            where: { parentOrgId: orgId, universityId: user.universityId },
            select: { id: true, visibility: true },
          })
          if (!chapter) return

          // Only create if not already a member
          await prisma.orgMembership.upsert({
            where: { userId_orgId: { userId, orgId: chapter.id } },
            update: {},
            create: {
              userId,
              orgId: chapter.id,
              role: 'member',
              status: chapter.visibility === 'open' ? 'approved' : 'pending',
            },
          })
        } catch {
          // Cascade is best-effort — never surface errors to the caller
        }
      })()
    }
  },

  /**
   * Returns the chapter orgs that belong to an umbrella org.
   * Results are ordered by university name (via join) then org name.
   * Returns an empty array if the org has no chapters.
   */
  async listChapters(
    orgId: string,
  ): Promise<{ id: string; name: string; handle: string; avatarUrl: string | null; type: string; visibility: string; universityId: string | null; memberCount: number; universityName: string | null }[]> {
    const chapters = await prisma.organization.findMany({
      where: { parentOrgId: orgId },
      include: {
        _count: { select: { memberships: true } },
        university: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    })

    return chapters.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      avatarUrl: c.avatarUrl,
      type: c.type,
      visibility: c.visibility,
      universityId: c.universityId,
      memberCount: c._count.memberships,
      universityName: c.university?.name ?? null,
    }))
  },

  /**
   * Removes the OrgMembership row for (orgId, userId).
   *
   * Throws 404 when no active membership exists.
   */
  async leaveOrg(orgId: string, userId: string): Promise<void> {
    const membership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { id: true },
    })

    if (!membership) {
      throw ApiError.notFound('You are not a member of this organisation')
    }

    await prisma.orgMembership.delete({
      where: { userId_orgId: { userId, orgId } },
    })
  },

  /**
   * Returns a paginated list of approved org members, ordered by joinedAt desc.
   *
   * cursor is a joinedAt ISO timestamp (string). When provided, only rows with
   * joinedAt < cursor are returned to implement keyset pagination.
   *
   * Returns 20 members per page with a nextCursor for subsequent pages.
   */
  async getOrgMembers(
    orgId: string,
    cursor?: string,
  ): Promise<{ members: OrgMember[]; nextCursor: string | null }> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    })

    if (!org) {
      throw ApiError.notFound('Organisation not found')
    }

    // Fetch PAGE_SIZE + 1 to determine whether more pages follow
    const rows = await prisma.orgMembership.findMany({
      where: {
        orgId,
        status: 'approved',
        ...(cursor ? { joinedAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: PAGE_SIZE + 1,
    })

    const hasMore = rows.length > PAGE_SIZE
    const pageRows = rows.slice(0, PAGE_SIZE)

    // Build next cursor from the last item's joinedAt timestamp
    const nextCursor =
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].joinedAt.toISOString()
        : null

    const members: OrgMember[] = pageRows.map((row) => ({
      userId: row.user.id,
      username: row.user.username,
      displayName: row.user.displayName,
      avatarUrl: row.user.avatarUrl,
      // Map moderator to 'admin' for the public-facing type; owner is not in
      // MembershipRole enum so 'admin' also covers the highest privilege tier
      role:
        row.role === 'admin' || row.role === 'moderator'
          ? 'admin'
          : 'member',
      joinedAt: row.joinedAt.toISOString(),
    }))

    return { members, nextCursor }
  },

  /**
   * Returns a cursor-paginated feed of posts belonging to a given org.
   *
   * Posts are ordered by createdAt desc. cursor is a createdAt ISO timestamp.
   * Returns 20 posts per page.
   *
   * viewerUserId is optional — vote state is omitted (null) for guests.
   */
  async getOrgFeed(
    orgId: string,
    viewerUserId?: string,
    cursor?: string,
  ): Promise<FeedPage> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    })

    if (!org) {
      throw ApiError.notFound('Organisation not found')
    }

    // Fetch PAGE_SIZE + 1 to detect whether more pages follow
    const rawRows = (await prisma.post.findMany({
      where: {
        orgId,
        isRemoved: false,
        author: { isBanned: false },
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: buildPostInclude(),
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    })) as unknown as RawPost[]

    const hasMore = rawRows.length > PAGE_SIZE
    const pageRows = rawRows.slice(0, PAGE_SIZE)

    // Batch-fetch viewer votes in a single query; empty map for guests
    const postIds = pageRows.map((r) => r.id)
    const voteMap = viewerUserId
      ? await batchFetchUserVotes(postIds, viewerUserId)
      : new Map<string, 'up' | 'down'>()

    const posts = pageRows.map((r) => toPostWithDetails(r, voteMap.get(r.id) ?? null))

    // cursor for next page is the createdAt of the last item on this page
    const lastRow = pageRows[pageRows.length - 1]
    const nextCursor = hasMore && lastRow ? lastRow.createdAt.toISOString() : null

    return { posts, nextCursor, hasMore }
  },
}
