import { ContentType, Prisma } from '@prisma/client'
import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import { moderationService } from './moderationService'
import type { Post, PostWithDetails, RepostOrigin } from '@portal/types'

// ─── Input Types ──────────────────────────────────────────────────────────────

interface PollOptionInput {
  id: string
  text: string
  voteCount: number
}

interface PollDataInput {
  question: string
  options: PollOptionInput[]
  /** ISO date string for when the poll closes */
  endsAt: string
}

export interface CreatePostInput {
  contentType: ContentType
  /** Required for text / rich_text */
  content?: string
  /** Required for image (1–4 URLs) */
  mediaUrls?: string[]
  /** Required for link */
  linkUrl?: string
  /** Optional structured OG metadata for link posts */
  linkPreview?: Record<string, unknown>
  /** Required for poll */
  pollData?: PollDataInput
  /** Optional – ties the post to an organisation */
  orgId?: string
  /** Set internally by repostPost — consumers pass repostOfId directly */
  repostOfId?: string
  /** Set internally by quotePost */
  quoteOfId?: string
  quoteContent?: string
}

// ─── Author select shape ──────────────────────────────────────────────────────

/** Minimal author projection included in every PostWithDetails response. */
const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const

/** Minimal org projection included when a post belongs to an organisation. */
const ORG_SELECT = {
  id: true,
  name: true,
  handle: true,
  avatarUrl: true,
} as const

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Validates that all content-type-specific required fields are present.
 * Throws ApiError.badRequest with a descriptive message on the first violation.
 */
function validateContentTypeFields(data: CreatePostInput): void {
  const { contentType } = data

  if (contentType === 'text' || contentType === 'rich_text') {
    if (!data.content || data.content.trim().length === 0) {
      throw ApiError.badRequest(`content is required for ${contentType} posts`)
    }
    return
  }

  if (contentType === 'image') {
    if (!data.mediaUrls || data.mediaUrls.length === 0) {
      throw ApiError.badRequest('mediaUrls is required for image posts')
    }
    if (data.mediaUrls.length > 4) {
      throw ApiError.badRequest('image posts support a maximum of 4 images')
    }
    return
  }

  if (contentType === 'poll') {
    if (!data.pollData) {
      throw ApiError.badRequest('pollData is required for poll posts')
    }
    if (!data.pollData.question || data.pollData.question.trim().length === 0) {
      throw ApiError.badRequest('pollData.question is required')
    }
    if (!data.pollData.options || data.pollData.options.length < 2) {
      throw ApiError.badRequest('poll posts require at least 2 options')
    }
    return
  }

  if (contentType === 'link') {
    if (!data.linkUrl || data.linkUrl.trim().length === 0) {
      throw ApiError.badRequest('linkUrl is required for link posts')
    }
    return
  }

  if (contentType === 'repost') {
    if (!data.repostOfId) {
      throw ApiError.badRequest('repostOfId is required for repost posts')
    }
    return
  }
}

/**
 * Maps a raw Prisma post row plus resolved relations into the PostWithDetails
 * shape defined in @portal/types.
 */
function toPostWithDetails(
  raw: {
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
  },
  userVote: 'up' | 'down' | null,
): PostWithDetails {
  return {
    id: raw.id,
    authorId: raw.authorId,
    content: raw.content,
    contentType: raw.contentType as Post['contentType'],
    mediaUrls: (raw.mediaUrls as string[]) ?? [],
    linkUrl: raw.linkUrl,
    linkPreview: (raw.linkPreview as Post['linkPreview']) ?? null,
    pollId: raw.pollId,
    pollData: raw.poll
      ? {
          id: raw.poll.id,
          question: raw.poll.question,
          options: raw.poll.options as Post['pollData'] extends { options: infer O } ? O : never,
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

// ─── Post Service ─────────────────────────────────────────────────────────────

export const postService = {
  /**
   * Creates a new post for the given author.
   *
   * - Validates content-type-specific required fields before touching the DB.
   * - Auto-populates universityId from the author's user record so callers
   *   never have to pass it explicitly.
   * - For poll posts, creates the `polls` record and links it to the post
   *   inside a single Prisma transaction to keep data consistent.
   */
  async createPost(authorId: string, data: CreatePostInput): Promise<Post> {
    validateContentTypeFields(data)

    // Fetch author to inherit their universityId — avoids caller having to
    // supply it and guarantees the campus feed query is always accurate.
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: { universityId: true },
    })

    if (!author) {
      throw ApiError.notFound('Author not found')
    }

    const { universityId } = author

    // Poll posts require a transactional create so the poll and post are
    // always in sync — no orphaned polls and no posts referencing missing polls.
    if (data.contentType === 'poll' && data.pollData) {
      const pollPost = await prisma.$transaction(async (tx) => {
        const poll = await tx.poll.create({
          data: {
            question: data.pollData!.question,
            options: data.pollData!.options as object,
            endsAt: new Date(data.pollData!.endsAt),
          },
        })

        return tx.post.create({
          data: {
            authorId,
            contentType: data.contentType,
            content: data.content ?? null,
            mediaUrls: [],
            linkUrl: null,
            linkPreview: Prisma.JsonNull,
            pollId: poll.id,
            orgId: data.orgId ?? null,
            universityId,
          },
        }) as unknown as Post
      })

      // Fire-and-forget moderation check — must never block post creation.
      const moderationText = data.pollData.question
      void (async () => {
        try {
          const mod = await moderationService.moderateContent(moderationText)
          if (mod.flagged) {
            await prisma.report.create({
              data: {
                reporterId: authorId,
                targetId: pollPost.id,
                targetType: 'post',
                reason: 'spam',
                details:
                  'Auto-flagged by AI moderation' +
                  (mod.reason ? ': ' + mod.reason : ''),
              },
            })
          }
        } catch {
          /* silent — moderation must never surface errors to the caller */
        }
      })()

      return pollPost
    }

    const post = await prisma.post.create({
      data: {
        authorId,
        contentType: data.contentType,
        content: data.content ?? null,
        mediaUrls: (data.mediaUrls ?? []) as object,
        linkUrl: data.linkUrl ?? null,
        linkPreview: data.linkPreview != null ? (data.linkPreview as Prisma.InputJsonValue) : Prisma.JsonNull,
        orgId: data.orgId ?? null,
        universityId,
        repostOfId: data.repostOfId ?? null,
        quoteOfId: data.quoteOfId ?? null,
        quoteContent: data.quoteContent ?? null,
      },
    }) as unknown as Post

    // Fire-and-forget moderation check — must never block post creation.
    // Only moderate posts that carry text content worth inspecting.
    const textToModerate = data.content ?? data.linkUrl ?? null
    if (textToModerate) {
      void (async () => {
        try {
          const mod = await moderationService.moderateContent(textToModerate)
          if (mod.flagged) {
            await prisma.report.create({
              data: {
                reporterId: authorId,
                targetId: post.id,
                targetType: 'post',
                reason: 'spam',
                details:
                  'Auto-flagged by AI moderation' +
                  (mod.reason ? ': ' + mod.reason : ''),
              },
            })
          }
        } catch {
          /* silent — moderation must never surface errors to the caller */
        }
      })()
    }

    return post
  },

  /**
   * Fetches a single post by ID with author, org, and the caller's vote state.
   *
   * - Throws 404 if the post does not exist.
   * - viewerId is optional; when omitted userVote is always null.
   */
  async getPostById(postId: string, viewerId?: string): Promise<PostWithDetails> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: AUTHOR_SELECT },
        org: { select: ORG_SELECT },
        poll: {
          select: { id: true, question: true, options: true, endsAt: true },
        },
        // Piggyback the original post data so repost cards can render without
        // a second round-trip. Prisma returns null when repostOfId is null.
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
      },
    })

    if (!post) {
      throw ApiError.notFound('Post not found')
    }

    const userVote = viewerId ? await postService.getPostVote(postId, viewerId) : null

    return toPostWithDetails(post, userVote)
  },

  /**
   * Soft-deletes a post by setting is_removed = true.
   *
   * - Only the post's author or a super_admin may delete.
   * - Throws 404 if the post does not exist.
   * - Throws 403 if the requester lacks permission.
   */
  async deletePost(postId: string, requesterId: string): Promise<void> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, isRemoved: true },
    })

    if (!post) {
      throw ApiError.notFound('Post not found')
    }

    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    })

    if (!requester) {
      throw ApiError.notFound('Requester not found')
    }

    const isAuthor = post.authorId === requesterId
    const isSuperAdmin = requester.role === 'super_admin'

    if (!isAuthor && !isSuperAdmin) {
      throw ApiError.forbidden('You do not have permission to delete this post')
    }

    await prisma.post.update({
      where: { id: postId },
      data: {
        isRemoved: true,
        removedById: requesterId,
      },
    })
  },

  /**
   * Creates a simple repost (no added content).
   *
   * - Guards against duplicate reposts — one repost per user per original post.
   * - Increments repost_count on the original post inside a transaction so
   *   the counter stays consistent with the repost record.
   */
  async repostPost(postId: string, userId: string): Promise<Post> {
    const original = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isRemoved: true },
    })

    if (!original) {
      throw ApiError.notFound('Post not found')
    }

    if (original.isRemoved) {
      throw ApiError.badRequest('Cannot repost a removed post')
    }

    // Check for an existing repost by this user for the same original post.
    const existingRepost = await prisma.post.findFirst({
      where: {
        authorId: userId,
        repostOfId: postId,
        contentType: 'repost',
        isRemoved: false,
      },
      select: { id: true },
    })

    if (existingRepost) {
      throw ApiError.conflict('You have already reposted this post')
    }

    // Fetch the author's universityId to carry forward on the repost record.
    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { universityId: true },
    })

    if (!author) {
      throw ApiError.notFound('User not found')
    }

    return prisma.$transaction(async (tx) => {
      const repost = await tx.post.create({
        data: {
          authorId: userId,
          contentType: 'repost',
          repostOfId: postId,
          universityId: author.universityId,
          mediaUrls: [],
        },
      })

      await tx.post.update({
        where: { id: postId },
        data: { repostCount: { increment: 1 } },
      })

      return repost as unknown as Post
    })
  },

  /**
   * Creates a quote post — a new post with quote_of_id set and the caller's
   * commentary in the content field.
   *
   * - Throws 404 if the quoted post does not exist or is removed.
   */
  async quotePost(postId: string, userId: string, content: string): Promise<Post> {
    if (!content || content.trim().length === 0) {
      throw ApiError.badRequest('content is required for quote posts')
    }

    const original = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, isRemoved: true },
    })

    if (!original) {
      throw ApiError.notFound('Post not found')
    }

    if (original.isRemoved) {
      throw ApiError.badRequest('Cannot quote a removed post')
    }

    const author = await prisma.user.findUnique({
      where: { id: userId },
      select: { universityId: true },
    })

    if (!author) {
      throw ApiError.notFound('User not found')
    }

    return prisma.post.create({
      data: {
        authorId: userId,
        contentType: 'text',
        content: content.trim(),
        quoteOfId: postId,
        universityId: author.universityId,
        mediaUrls: [],
      },
    }) as unknown as Post
  },

  /**
   * Returns the current user's vote direction on a post, or null if they have
   * not voted. Used to populate userVote in PostWithDetails responses.
   */
  async getPostVote(postId: string, userId: string): Promise<'up' | 'down' | null> {
    const vote = await prisma.vote.findUnique({
      where: {
        userId_targetId_targetType: {
          userId,
          targetId: postId,
          targetType: 'post',
        },
      },
      select: { value: true },
    })

    if (!vote) return null

    // VoteValue enum values are 'up' and 'down' — cast to the union type
    // expected by PostWithDetails without an unsafe any.
    return vote.value as 'up' | 'down'
  },
}
