import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'

// ---------------------------------------------------------------------------
// Validation schema for PATCH /me
// ---------------------------------------------------------------------------
const updateMeSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(300).optional(),
  // null explicitly clears the association; undefined means no change
  universityId: z.string().uuid().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/users/me
// Requires authenticate middleware on route.
// ---------------------------------------------------------------------------
export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by the authenticate middleware
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { university: true },
    })

    if (!user) {
      return next(ApiError.notFound('User not found'))
    }

    // Omit sensitive fields before returning
    const { password, ...safeUser } = user

    res.status(200).json({ user: safeUser })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/me
// Requires authenticate middleware on route.
// ---------------------------------------------------------------------------
export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parseResult = updateMeSchema.safeParse(req.body)

    if (!parseResult.success) {
      return next(
        ApiError.badRequest(parseResult.error.errors[0]?.message ?? 'Invalid request body'),
      )
    }

    const data = parseResult.data

    // Build the update payload — only include fields that were explicitly provided
    // (handles the distinction between undefined = no change and null = clear field)
    const updatePayload: Record<string, unknown> = {}

    if (data.displayName !== undefined) updatePayload.displayName = data.displayName
    if (data.bio !== undefined) updatePayload.bio = data.bio
    if (data.universityId !== undefined) updatePayload.universityId = data.universityId
    if (data.avatarUrl !== undefined) updatePayload.avatarUrl = data.avatarUrl

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: updatePayload,
      include: { university: true },
    })

    const { password, ...safeUser } = updated

    res.status(200).json({ user: safeUser })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/me
// Requires authenticate middleware on route.
// Deletes the authenticated user's account. Cascade rules in the Prisma schema
// handle related rows automatically. If a constraint error surfaces (meaning
// cascades are not configured for a relation), the error is forwarded to the
// global error handler rather than silently swallowed.
// ---------------------------------------------------------------------------
export async function deleteMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await prisma.user.delete({ where: { id: req.user!.id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/users/:username
// Uses optionalAuth middleware on route — req.user may be undefined.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = req.params

    // Accept both a UUID (lookup by id) and a plain username string.
    const where = UUID_RE.test(username)
      ? { id: username }
      : { username: { equals: username, mode: 'insensitive' as const } }

    const user = await prisma.user.findFirst({
      where,
      include: {
        university: true,
        orgMemberships: {
          where: { status: 'approved' },
          include: { org: true },
        },
        // Follower/following counts via _count
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    })

    if (!user) {
      return next(ApiError.notFound('User not found'))
    }

    // Omit password before sending the public profile
    const { password, ...safeUser } = user

    res.status(200).json({ user: safeUser })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/users/universities  (public — no auth required)
// Query params: search?: string, limit?: number (default 20, max 50)
// NOTE: This route must be mounted BEFORE /:username in the router to avoid
//       "universities" being captured as a username parameter.
// ---------------------------------------------------------------------------
export async function getUniversities(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined

    // Parse and clamp limit: default 20, max 50
    const rawLimit = Number(req.query.limit)
    const limit = Number.isNaN(rawLimit) || rawLimit <= 0
      ? 20
      : Math.min(rawLimit, 50)

    const universities = await prisma.university.findMany({
      ...(search
        ? { where: { name: { contains: search, mode: 'insensitive' } } }
        : {}),
      take: limit,
      orderBy: { name: 'asc' },
    })

    res.status(200).json({ universities })
  } catch (err) {
    next(err)
  }
}
