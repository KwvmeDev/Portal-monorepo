import { prisma } from '../prisma/client'
import type { UserSummary, OrgSummary, PostWithDetails, SearchResults } from '@portal/types'

const SEARCH_LIMIT = 20

const userSelect = {
  id: true, username: true, displayName: true, avatarUrl: true, bio: true, universityId: true,
} as const

export const searchService = {
  async searchUsers(query: string): Promise<UserSummary[]> {
    const rows = await prisma.user.findMany({
      where: {
        isBanned: false,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: userSelect,
      take: SEARCH_LIMIT,
    })
    return rows
  },

  async searchPosts(query: string): Promise<PostWithDetails[]> {
    const rows = await prisma.post.findMany({
      where: {
        isRemoved: false,
        author: { isBanned: false },
        content: { contains: query, mode: 'insensitive' },
      },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        org: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        poll: { select: { id: true, question: true, options: true, endsAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: SEARCH_LIMIT,
    })
    // Map to PostWithDetails — userVote is null (no per-user vote lookup for search)
    return rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      content: r.content,
      contentType: r.contentType as PostWithDetails['contentType'],
      mediaUrls: (r.mediaUrls as string[]) ?? [],
      linkUrl: r.linkUrl,
      linkPreview: (r.linkPreview as PostWithDetails['linkPreview']) ?? null,
      pollId: r.pollId,
      pollData: r.poll ? {
        id: r.poll.id,
        question: r.poll.question,
        options: r.poll.options as PostWithDetails['pollData'] extends { options: infer O } ? O : never,
        endsAt: r.poll.endsAt.toISOString(),
      } : null,
      orgId: r.orgId,
      universityId: r.universityId,
      repostOfId: r.repostOfId,
      quoteOfId: r.quoteOfId,
      quoteContent: r.quoteContent,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      commentCount: r.commentCount,
      repostCount: r.repostCount,
      isPinned: r.isPinned,
      isRemoved: r.isRemoved,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      author: r.author,
      org: r.org,
      userVote: null,
    })) as PostWithDetails[]
  },

  async searchOrgs(query: string): Promise<OrgSummary[]> {
    const rows = await prisma.organization.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { handle: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        _count: { select: { memberships: true } },
      },
      take: SEARCH_LIMIT,
    })
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      handle: r.handle,
      avatarUrl: r.avatarUrl,
      type: r.type as OrgSummary['type'],
      visibility: r.visibility as OrgSummary['visibility'],
      memberCount: r._count.memberships,
    }))
  },

  async search(query: string, type: 'all' | 'users' | 'posts' | 'orgs'): Promise<SearchResults> {
    const [users, posts, orgs] = await Promise.all([
      type === 'all' || type === 'users' ? searchService.searchUsers(query) : Promise.resolve([]),
      type === 'all' || type === 'posts' ? searchService.searchPosts(query) : Promise.resolve([]),
      type === 'all' || type === 'orgs' ? searchService.searchOrgs(query) : Promise.resolve([]),
    ])
    return { users, posts, orgs }
  },
}
