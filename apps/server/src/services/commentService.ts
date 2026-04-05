import { VoteTargetType, VoteValue } from '@prisma/client'
import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'
import { notificationService } from './notificationService'
import type { CommentWithDetails, CommentPage } from '@portal/types'

// ─── Author Select ────────────────────────────────────────────────────────────

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Fetches the current vote record for a user+comment combination.
 * Returns null when no vote exists.
 */
async function findExistingCommentVote(userId: string, commentId: string) {
  return prisma.vote.findUnique({
    where: {
      userId_targetId_targetType: {
        userId,
        targetId: commentId,
        targetType: VoteTargetType.comment,
      },
    },
    select: { id: true, value: true },
  })
}

/**
 * Fetches a comment by id and returns it shaped as CommentWithDetails.
 * userVote is always null — callers that need it should fetch it separately.
 */
async function fetchCommentWithDetails(commentId: string): Promise<CommentWithDetails> {
  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { author: { select: authorSelect } },
  })

  if (!row) {
    throw ApiError.notFound('Comment not found')
  }

  return {
    id: row.id,
    postId: row.postId,
    authorId: row.authorId,
    parentId: row.parentId,
    content: row.content,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    isRemoved: row.isRemoved,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    userVote: null,
  }
}

// ─── Comment Service ──────────────────────────────────────────────────────────

export const commentService = {
  /**
   * Creates a new comment on a post.
   *
   * Runs inside a Prisma transaction so the Comment insert and the
   * Post.commentCount increment either both succeed or both roll back.
   *
   * parentId is optional — omit or pass null for a top-level comment.
   * Throws ApiError 404 when the post does not exist.
   */
  async createComment(
    postId: string,
    authorId: string,
    content: string,
    parentId?: string | null,
  ): Promise<CommentWithDetails> {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    })

    if (!post) {
      throw ApiError.notFound('Post not found')
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId,
          authorId,
          content,
          parentId: parentId ?? null,
        },
        include: { author: { select: authorSelect } },
      })

      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      })

      return created
    })

    // Fire-and-forget — notification failure must not roll back the comment
    void notificationService.createNotification({
      recipientId: post.authorId,
      type: parentId ? 'reply' : 'comment',
      actorId: authorId,
      targetId: comment.id,
      targetType: 'comment',
    })

    return {
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      parentId: comment.parentId,
      content: comment.content,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      isRemoved: comment.isRemoved,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
      userVote: null,
    }
  },

  /**
   * Returns a paginated page of top-level comments for a post.
   *
   * Ordering: top-level comments by createdAt DESC, cursor-based using (createdAt, id).
   * Each top-level comment includes up to 3 replies ordered createdAt ASC.
   * When userId is provided, user votes are batch-fetched for all comment IDs.
   */
  async getComments(
    postId: string,
    userId?: string,
    cursor?: string,
  ): Promise<CommentPage> {
    const PAGE_SIZE = 20

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
    const topLevelRows = await prisma.comment.findMany({
      where: {
        postId,
        parentId: null,
        ...(cursorCreatedAt && cursorId
          ? {
              OR: [
                { createdAt: { lt: cursorCreatedAt } },
                { createdAt: cursorCreatedAt, id: { gt: cursorId } },
              ],
            }
          : {}),
      },
      include: { author: { select: authorSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: PAGE_SIZE + 1,
    })

    const hasMore = topLevelRows.length > PAGE_SIZE
    const pageRows = topLevelRows.slice(0, PAGE_SIZE)

    // Batch-fetch up to 3 replies per top-level comment
    const topLevelIds = pageRows.map((c) => c.id)

    const replyRows = topLevelIds.length > 0
      ? await prisma.comment.findMany({
          where: { parentId: { in: topLevelIds } },
          include: { author: { select: authorSelect } },
          orderBy: [{ createdAt: 'asc' }],
        })
      : []

    // Group replies by parentId, keeping only the first 3
    const repliesByParent = new Map<string, typeof replyRows>()
    for (const reply of replyRows) {
      if (reply.parentId === null) continue
      const existing = repliesByParent.get(reply.parentId) ?? []
      if (existing.length < 3) {
        existing.push(reply)
        repliesByParent.set(reply.parentId, existing)
      }
    }

    // Collect all comment ids (top-level + replies) for batch vote fetch
    const allReplyIds = replyRows.map((r) => r.id)
    const allCommentIds = [...topLevelIds, ...allReplyIds]

    // Batch-fetch votes in a single query to avoid N+1
    let voteMap = new Map<string, 'up' | 'down'>()
    if (userId && allCommentIds.length > 0) {
      const votes = await prisma.vote.findMany({
        where: {
          userId,
          targetId: { in: allCommentIds },
          targetType: VoteTargetType.comment,
        },
        select: { targetId: true, value: true },
      })
      voteMap = new Map(votes.map((v) => [v.targetId, v.value as 'up' | 'down']))
    }

    const toDetails = (row: (typeof pageRows)[number]): CommentWithDetails => ({
      id: row.id,
      postId: row.postId,
      authorId: row.authorId,
      parentId: row.parentId,
      content: row.content,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
      isRemoved: row.isRemoved,
      createdAt: row.createdAt.toISOString(),
      author: row.author,
      userVote: voteMap.get(row.id) ?? null,
    })

    // Build the flat list: each top-level comment followed by its (up to 3) replies
    const comments: CommentWithDetails[] = []
    for (const topLevel of pageRows) {
      comments.push(toDetails(topLevel))
      const replies = repliesByParent.get(topLevel.id) ?? []
      for (const reply of replies) {
        comments.push(toDetails(reply))
      }
    }

    // Build next cursor from last top-level item on this page
    const lastItem = pageRows[pageRows.length - 1]
    const nextCursor =
      hasMore && lastItem
        ? Buffer.from(
            JSON.stringify({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id }),
          ).toString('base64')
        : null

    return { comments, nextCursor, hasMore }
  },

  /**
   * Soft-deletes a comment by setting isRemoved = true.
   *
   * Requester must be the comment author OR have a moderator/admin role.
   * Decrements Post.commentCount atomically in the same transaction.
   *
   * Throws 404 when the comment does not exist.
   * Throws 403 when the requester lacks permission.
   */
  async deleteComment(
    commentId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<void> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true, isRemoved: true },
    })

    if (!comment) {
      throw ApiError.notFound('Comment not found')
    }

    const isAuthor = comment.authorId === requesterId
    const isModerator = ['moderator', 'org_admin', 'super_admin'].includes(requesterRole)

    if (!isAuthor && !isModerator) {
      throw ApiError.forbidden('You do not have permission to delete this comment')
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { isRemoved: true },
      })

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      })
    })
  },

  /**
   * Applies an upvote or downvote on a comment for the given user.
   *
   * Three cases handled atomically:
   *   1. No prior vote  → INSERT vote + INCREMENT the matching counter
   *   2. Same vote again → DELETE vote + DECREMENT (toggle off)
   *   3. Opposite vote  → UPDATE vote + DECREMENT old + INCREMENT new
   *
   * Throws ApiError 404 when the comment does not exist.
   */
  async voteComment(
    commentId: string,
    userId: string,
    value: 'up' | 'down',
  ): Promise<CommentWithDetails> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    })

    if (!comment) {
      throw ApiError.notFound('Comment not found')
    }

    const incomingValue = value === 'up' ? VoteValue.up : VoteValue.down
    const existingVote = await findExistingCommentVote(userId, commentId)

    await prisma.$transaction(async (tx) => {
      if (!existingVote) {
        // Case 1: No prior vote — insert and increment.
        await tx.vote.create({
          data: {
            userId,
            targetId: commentId,
            targetType: VoteTargetType.comment,
            value: incomingValue,
          },
        })

        const counterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'
        await tx.comment.update({
          where: { id: commentId },
          data: { [counterField]: { increment: 1 } },
        })
        return
      }

      if (existingVote.value === incomingValue) {
        // Case 2: Same vote cast again — remove and decrement (toggle off).
        await tx.vote.delete({ where: { id: existingVote.id } })

        const counterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'
        await tx.comment.update({
          where: { id: commentId },
          data: { [counterField]: { decrement: 1 } },
        })
        return
      }

      // Case 3: Opposite vote — update value, decrement old counter, increment new counter.
      await tx.vote.update({
        where: { id: existingVote.id },
        data: { value: incomingValue },
      })

      const oldCounterField = existingVote.value === VoteValue.up ? 'upvotes' : 'downvotes'
      const newCounterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'

      await tx.comment.update({
        where: { id: commentId },
        data: {
          [oldCounterField]: { decrement: 1 },
          [newCounterField]: { increment: 1 },
        },
      })
    })

    // Re-read final state after transaction for a consistent return value
    const finalVote = await findExistingCommentVote(userId, commentId)
    const updated = await fetchCommentWithDetails(commentId)

    return { ...updated, userVote: finalVote ? (finalVote.value as 'up' | 'down') : null }
  },

  /**
   * Removes the authenticated user's vote on a comment and updates counters atomically.
   *
   * No-ops silently when no vote exists (idempotent DELETE semantics).
   * Throws ApiError 404 when the comment does not exist.
   */
  async removeCommentVote(commentId: string, userId: string): Promise<CommentWithDetails> {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    })

    if (!comment) {
      throw ApiError.notFound('Comment not found')
    }

    const existingVote = await findExistingCommentVote(userId, commentId)

    if (existingVote) {
      await prisma.$transaction(async (tx) => {
        await tx.vote.delete({ where: { id: existingVote.id } })

        const counterField = existingVote.value === VoteValue.up ? 'upvotes' : 'downvotes'
        await tx.comment.update({
          where: { id: commentId },
          data: { [counterField]: { decrement: 1 } },
        })
      })
    }

    return fetchCommentWithDetails(commentId)
  },
}
