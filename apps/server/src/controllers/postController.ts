import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma/client'
import { postService } from '../services/postService'
import { feedService } from '../services/feedService'
import { voteService } from '../services/voteService'
import { fetchLinkPreview } from '../services/linkPreviewService'
import { ApiError } from '../utils/ApiError'
import type { ContentType } from '@prisma/client'

// ─── Validation Schemas ───────────────────────────────────────────────────────

const previewLinkSchema = z.object({
  url: z
    .string({ required_error: 'url is required' })
    .url('url must be a valid URL')
    // Only allow http/https — block file://, ftp://, etc.
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      { message: 'url must use http or https' },
    ),
})

const createPostSchema = z.object({
  contentType: z.enum(['text', 'rich_text', 'image', 'poll', 'link', 'repost'] as const),
  content: z.string().optional(),
  mediaUrls: z.array(z.string().url('Each mediaUrl must be a valid URL')).max(4).optional(),
  linkUrl: z.string().url('linkUrl must be a valid URL').optional(),
  linkPreview: z.record(z.unknown()).optional(),
  pollData: z
    .object({
      question: z.string().min(1, 'Poll question is required'),
      options: z
        .array(
          z.object({
            id: z.string(),
            text: z.string().min(1, 'Option text is required'),
            voteCount: z.number().int().min(0).default(0),
          }),
        )
        .min(2, 'Polls require at least 2 options'),
      endsAt: z.string().datetime({ message: 'endsAt must be a valid ISO date string' }),
    })
    .optional(),
  orgId: z.string().uuid('orgId must be a valid UUID').optional(),
})

const quotePostSchema = z.object({
  content: z.string().min(1, 'content is required for quote posts'),
})

const votePostSchema = z.object({
  value: z.enum(['up', 'down'] as const, {
    errorMap: () => ({ message: "value must be 'up' or 'down'" }),
  }),
})

const votePollSchema = z.object({
  optionId: z.string().min(1, 'optionId is required'),
})

// ─── previewLink ──────────────────────────────────────────────────────────────

/**
 * POST /api/posts/preview-link  (requires authentication)
 *
 * Body: { url: string }
 *
 * Fetches the target URL server-side, parses Open Graph and fallback meta
 * tags, caches the result in Redis for 24 h, and returns a lightweight
 * preview object.
 *
 * Response: { title, description, imageUrl, url }
 *
 * Returns 400 for:
 *   - Malformed / non-http(s) URL in the request body
 *   - URLs that time out or return a non-2xx response
 * Internal errors are never surfaced to the client.
 */
export async function previewLink(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = previewLinkSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(
        new ApiError(parsed.error.errors[0].message, 400, 'validation_error'),
      )
    }

    const { url } = parsed.data

    // fetchLinkPreview throws a plain Error on invalid/unreachable URLs.
    // We catch it here and convert to a 400 — no internal details exposed.
    let preview
    try {
      preview = await fetchLinkPreview(url)
    } catch {
      return next(ApiError.badRequest('URL is invalid or unreachable'))
    }

    res.status(200).json(preview)
  } catch (err) {
    next(err)
  }
}

// ─── createPost ───────────────────────────────────────────────────────────────

/**
 * POST /api/posts  (authenticated)
 *
 * Body: { contentType, content?, mediaUrls?, linkUrl?, linkPreview?, pollData?, orgId? }
 *
 * Creates a new post for the authenticated user. Returns 201 with the full
 * post object on success.
 *
 * // TODO Sprint 8: run AI moderation middleware before persisting post
 */
export async function createPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = createPostSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const post = await postService.createPost(req.user.id, {
      contentType: parsed.data.contentType as ContentType,
      content: parsed.data.content,
      mediaUrls: parsed.data.mediaUrls,
      linkUrl: parsed.data.linkUrl,
      linkPreview: parsed.data.linkPreview,
      pollData: parsed.data.pollData,
      orgId: parsed.data.orgId,
    })

    res.status(201).json(post)
  } catch (err) {
    next(err)
  }
}

// ─── getPost ──────────────────────────────────────────────────────────────────

/**
 * GET /api/posts/:id  (auth optional)
 *
 * Returns full post details including author, org, and the viewer's vote state.
 * When unauthenticated, userVote is always null.
 */
export async function getPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params
    const viewerId = req.user?.id

    const post = await postService.getPostById(id, viewerId)

    res.status(200).json(post)
  } catch (err) {
    next(err)
  }
}

// ─── deletePost ───────────────────────────────────────────────────────────────

/**
 * DELETE /api/posts/:id  (authenticated)
 *
 * Soft-deletes a post by setting is_removed = true.
 * Only the post author or a super_admin may perform this action.
 * Returns 403 if the requester lacks permission.
 */
export async function deletePost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params

    await postService.deletePost(id, req.user.id)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ─── repostPost ───────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/repost  (authenticated)
 *
 * Creates a simple repost (no added content). Enforces one repost per user
 * per original post. Returns 409 if already reposted.
 */
export async function repostPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params

    const repost = await postService.repostPost(id, req.user.id)

    res.status(201).json(repost)
  } catch (err) {
    next(err)
  }
}

// ─── quotePost ────────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/quote  (authenticated)
 *
 * Body: { content }
 *
 * Creates a quote post — a new post with quote_of_id set and the caller's
 * commentary in the content field.
 */
export async function quotePost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = quotePostSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { id } = req.params

    const quote = await postService.quotePost(id, req.user.id, parsed.data.content)

    res.status(201).json(quote)
  } catch (err) {
    next(err)
  }
}

// ─── voteOnPost ───────────────────────────────────────────────────────────────

/**
 * POST /api/posts/:id/vote  (authenticated)
 *
 * Body: { value: 'up' | 'down' }
 *
 * Applies a vote on a post. Handles toggle (same vote removes) and switch
 * (opposite vote swaps counters) atomically via voteService.
 * Returns the updated vote state: { userVote, upvotes, downvotes }.
 */
export async function voteOnPost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = votePostSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { id } = req.params

    const result = await voteService.votePost(id, req.user.id, parsed.data.value)

    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}

// ─── removeVote ───────────────────────────────────────────────────────────────

/**
 * DELETE /api/posts/:id/vote  (authenticated)
 *
 * Removes the authenticated user's vote on a post if one exists.
 * No-ops silently if the user has not voted (idempotent DELETE semantics).
 */
export async function removeVote(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { id } = req.params
    const userId = req.user.id

    // Confirm post exists before attempting vote removal
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!post) {
      return next(ApiError.notFound('Post not found'))
    }

    // deleteMany is idempotent — silently no-ops when no vote record exists
    await prisma.vote.deleteMany({
      where: {
        userId,
        targetId: id,
        targetType: 'post',
      },
    })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ─── getUserPosts ─────────────────────────────────────────────────────────────

/**
 * GET /api/users/:id/posts  (auth optional)
 *
 * Returns a user's posts in reverse chronological order with cursor pagination.
 * Cursor encodes { createdAt, id } as base64 JSON.
 * Auth optional — viewer's vote state included when authenticated.
 */
export async function getUserPosts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: targetUserId } = req.params
    const viewerId = req.user?.id
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const PAGE_SIZE = 20

    // Verify target user exists before querying their posts
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    })

    if (!targetUser) {
      return next(ApiError.notFound('User not found'))
    }

    // Decode cursor encoding { createdAt: ISO string, id: string }
    let cursorCreatedAt: Date | undefined
    let cursorId: string | undefined

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
          createdAt: string
          id: string
        }
        cursorCreatedAt = new Date(decoded.createdAt)
        cursorId = decoded.id
      } catch {
        // Malformed cursor — start from the beginning
      }
    }

    // Fetch one extra to detect whether more pages exist
    const rawPosts = await prisma.post.findMany({
      where: {
        authorId: targetUserId,
        isRemoved: false,
        // Cursor-based pagination on (createdAt DESC, id ASC) for stable ordering
        ...(cursorCreatedAt && cursorId
          ? {
              OR: [
                { createdAt: { lt: cursorCreatedAt } },
                { createdAt: cursorCreatedAt, id: { gt: cursorId } },
              ],
            }
          : {}),
      },
      include: {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        org: {
          select: { id: true, name: true, handle: true, avatarUrl: true },
        },
        poll: {
          select: { id: true, question: true, options: true, endsAt: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE + 1,
    })

    const hasMore = rawPosts.length > PAGE_SIZE
    const pageItems = rawPosts.slice(0, PAGE_SIZE)

    // Batch-fetch viewer votes in a single query to avoid N+1
    let voteMap = new Map<string, 'up' | 'down'>()
    if (viewerId && pageItems.length > 0) {
      const postIds = pageItems.map((p) => p.id)
      const votes = await prisma.vote.findMany({
        where: { userId: viewerId, targetId: { in: postIds }, targetType: 'post' },
        select: { targetId: true, value: true },
      })
      voteMap = new Map(votes.map((v) => [v.targetId, v.value as 'up' | 'down']))
    }

    const posts = pageItems.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      content: p.content,
      contentType: p.contentType,
      mediaUrls: (p.mediaUrls as string[]) ?? [],
      linkUrl: p.linkUrl,
      linkPreview: p.linkPreview ?? null,
      pollId: p.pollId,
      pollData: p.poll
        ? {
            id: p.poll.id,
            question: p.poll.question,
            options: p.poll.options,
            endsAt: p.poll.endsAt.toISOString(),
          }
        : null,
      orgId: p.orgId,
      universityId: p.universityId,
      repostOfId: p.repostOfId,
      quoteOfId: p.quoteOfId,
      quoteContent: p.quoteContent,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      commentCount: p.commentCount,
      repostCount: p.repostCount,
      isPinned: p.isPinned,
      isRemoved: p.isRemoved,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      author: p.author,
      org: p.org,
      userVote: voteMap.get(p.id) ?? null,
    }))

    // Build next cursor from last item on this page
    const lastItem = pageItems[pageItems.length - 1]
    const nextCursor =
      hasMore && lastItem
        ? Buffer.from(
            JSON.stringify({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id }),
          ).toString('base64')
        : null

    res.status(200).json({ posts, nextCursor, hasMore })
  } catch (err) {
    next(err)
  }
}

// ─── getGlobalFeed ────────────────────────────────────────────────────────────

/**
 * GET /api/feed/global  (authenticated)
 *
 * Query: ?cursor=
 *
 * Returns hot-scored paginated feed from followed users and joined orgs.
 * First page is cached in Redis for 30 seconds per user.
 */
export async function getGlobalFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page = await feedService.getGlobalFeed(req.user.id, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── getCampusFeed ────────────────────────────────────────────────────────────

/**
 * GET /api/feed/campus  (authenticated)
 *
 * Query: ?cursor=
 *
 * Returns hot-scored paginated feed for the user's university. Returns an
 * empty page with a message when the user has no university set.
 */
export async function getCampusFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page = await feedService.getCampusFeed(req.user.id, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── getOrgFeed ───────────────────────────────────────────────────────────────

/**
 * GET /api/feed/org/:orgId  (authenticated)
 *
 * Query: ?cursor=
 *
 * Returns hot-scored paginated feed for an org. Enforces membership check
 * for invite_only orgs via feedService. Pinned posts always appear first.
 */
export async function getOrgFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { orgId } = req.params
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined

    const page = await feedService.getOrgFeed(orgId, req.user.id, cursor)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── votePoll ─────────────────────────────────────────────────────────────────

/**
 * POST /api/polls/:id/vote  (authenticated)
 *
 * Body: { optionId }
 *
 * Votes on a poll option. Guards against:
 *   - Poll not found
 *   - Poll expired (endsAt in the past)
 *   - Duplicate vote (one vote per user per poll enforced by DB constraint)
 *
 * Increments the option's voteCount in the JSONB options array and inserts
 * a poll_vote record inside a single transaction for consistency.
 *
 * Response: { options: PollOption[], userOptionId: string }
 *
 * // TODO Sprint 8: run AI moderation middleware on poll interactions if required
 */
export async function votePoll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = votePollSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { id: pollId } = req.params
    const { optionId } = parsed.data
    const userId = req.user.id

    // Fetch poll to validate existence and check expiry
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: { id: true, options: true, endsAt: true },
    })

    if (!poll) {
      return next(ApiError.notFound('Poll not found'))
    }

    if (poll.endsAt <= new Date()) {
      return next(new ApiError('This poll has expired', 400, 'poll_expired'))
    }

    // Guard duplicate votes — one vote per user per poll (@@unique on DB level)
    const existingVote = await prisma.pollVote.findUnique({
      where: { pollId_userId: { pollId, userId } },
      select: { id: true },
    })

    if (existingVote) {
      return next(new ApiError('You have already voted on this poll', 409, 'duplicate_poll_vote'))
    }

    // Verify the chosen option exists within the poll's JSONB options
    const options = poll.options as Array<{ id: string; text: string; voteCount: number }>
    const targetOption = options.find((o) => o.id === optionId)

    if (!targetOption) {
      return next(new ApiError('Option not found in this poll', 400, 'invalid_option'))
    }

    // Immutably increment voteCount for the target option only
    const updatedOptions = options.map((o) =>
      o.id === optionId ? { ...o, voteCount: o.voteCount + 1 } : o,
    )

    // Insert poll_vote record and update options atomically
    const updatedPoll = await prisma.$transaction(async (tx) => {
      await tx.pollVote.create({
        data: { pollId, userId, optionId },
      })

      return tx.poll.update({
        where: { id: pollId },
        data: { options: updatedOptions },
        select: { options: true },
      })
    })

    res.status(200).json({
      options: updatedPoll.options,
      userOptionId: optionId,
    })
  } catch (err) {
    next(err)
  }
}
