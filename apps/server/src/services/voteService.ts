import { VoteTargetType, VoteValue } from '@prisma/client'
import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'

// ─── Return Types ─────────────────────────────────────────────────────────────

export interface VoteResult {
  userVote: 'up' | 'down' | null
  upvotes: number
  downvotes: number
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Fetches the current vote record for a given user+target combination.
 * Returns null when no vote exists yet.
 */
async function findExistingVote(
  userId: string,
  targetId: string,
  targetType: VoteTargetType,
) {
  return prisma.vote.findUnique({
    where: {
      userId_targetId_targetType: { userId, targetId, targetType },
    },
    select: { id: true, value: true },
  })
}

// ─── Vote Service ─────────────────────────────────────────────────────────────

export const voteService = {
  /**
   * Applies an upvote or downvote on a post for the given user.
   *
   * Three cases handled atomically in a single Prisma transaction:
   *   1. No prior vote  → INSERT vote + INCREMENT the matching counter
   *   2. Same vote cast again → DELETE vote + DECREMENT the matching counter (toggle off)
   *   3. Opposite vote cast  → UPDATE vote value + DECREMENT old counter + INCREMENT new counter
   *
   * Throws ApiError 404 when the post does not exist.
   */
  async votePost(
    postId: string,
    userId: string,
    value: 'up' | 'down',
  ): Promise<VoteResult> {
    // Verify the post exists before entering the transaction — avoids a
    // silent no-op when the post has been deleted.
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    })

    if (!post) {
      throw ApiError.notFound('Post not found')
    }

    const incomingValue = value === 'up' ? VoteValue.up : VoteValue.down
    const existingVote = await findExistingVote(userId, postId, VoteTargetType.post)

    const updatedPost = await prisma.$transaction(async (tx) => {
      if (!existingVote) {
        // Case 1: No prior vote — insert and increment.
        await tx.vote.create({
          data: {
            userId,
            targetId: postId,
            targetType: VoteTargetType.post,
            value: incomingValue,
          },
        })

        const counterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'
        return tx.post.update({
          where: { id: postId },
          data: { [counterField]: { increment: 1 } },
          select: { upvotes: true, downvotes: true },
        })
      }

      if (existingVote.value === incomingValue) {
        // Case 2: Same vote cast again — remove and decrement (toggle off).
        await tx.vote.delete({ where: { id: existingVote.id } })

        const counterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'
        return tx.post.update({
          where: { id: postId },
          data: { [counterField]: { decrement: 1 } },
          select: { upvotes: true, downvotes: true },
        })
      }

      // Case 3: Opposite vote — update value, decrement old counter, increment new counter.
      await tx.vote.update({
        where: { id: existingVote.id },
        data: { value: incomingValue },
      })

      const oldCounterField = existingVote.value === VoteValue.up ? 'upvotes' : 'downvotes'
      const newCounterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'

      return tx.post.update({
        where: { id: postId },
        data: {
          [oldCounterField]: { decrement: 1 },
          [newCounterField]: { increment: 1 },
        },
        select: { upvotes: true, downvotes: true },
      })
    })

    // Re-read the final vote state after the transaction so the return value
    // is always consistent with what is actually stored.
    const finalVote = await findExistingVote(userId, postId, VoteTargetType.post)

    return {
      userVote: finalVote ? (finalVote.value as 'up' | 'down') : null,
      upvotes: updatedPost.upvotes,
      downvotes: updatedPost.downvotes,
    }
  },

  /**
   * Applies an upvote or downvote on a comment for the given user.
   *
   * Identical three-case logic to votePost, targeting the comments table.
   * Throws ApiError 404 when the comment does not exist.
   */
  async voteComment(
    commentId: string,
    userId: string,
    value: 'up' | 'down',
  ): Promise<VoteResult> {
    // Verify the comment exists before entering the transaction.
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    })

    if (!comment) {
      throw ApiError.notFound('Comment not found')
    }

    const incomingValue = value === 'up' ? VoteValue.up : VoteValue.down
    const existingVote = await findExistingVote(userId, commentId, VoteTargetType.comment)

    const updatedComment = await prisma.$transaction(async (tx) => {
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
        return tx.comment.update({
          where: { id: commentId },
          data: { [counterField]: { increment: 1 } },
          select: { upvotes: true, downvotes: true },
        })
      }

      if (existingVote.value === incomingValue) {
        // Case 2: Same vote cast again — remove and decrement (toggle off).
        await tx.vote.delete({ where: { id: existingVote.id } })

        const counterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'
        return tx.comment.update({
          where: { id: commentId },
          data: { [counterField]: { decrement: 1 } },
          select: { upvotes: true, downvotes: true },
        })
      }

      // Case 3: Opposite vote — update value, decrement old counter, increment new counter.
      await tx.vote.update({
        where: { id: existingVote.id },
        data: { value: incomingValue },
      })

      const oldCounterField = existingVote.value === VoteValue.up ? 'upvotes' : 'downvotes'
      const newCounterField = incomingValue === VoteValue.up ? 'upvotes' : 'downvotes'

      return tx.comment.update({
        where: { id: commentId },
        data: {
          [oldCounterField]: { decrement: 1 },
          [newCounterField]: { increment: 1 },
        },
        select: { upvotes: true, downvotes: true },
      })
    })

    const finalVote = await findExistingVote(userId, commentId, VoteTargetType.comment)

    return {
      userVote: finalVote ? (finalVote.value as 'up' | 'down') : null,
      upvotes: updatedComment.upvotes,
      downvotes: updatedComment.downvotes,
    }
  },
}
