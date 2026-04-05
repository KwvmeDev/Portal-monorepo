import { prisma } from '../prisma/client'

// ─── Push Token Service ───────────────────────────────────────────────────────

export const pushTokenService = {
  /**
   * Upserts an ExpoPushToken row for the given user.
   *
   * Uses the composite unique index (userId, token) as the lookup key.
   * If the row already exists the record is left unchanged (no updatedAt
   * field exists on this model). If the row is absent it is created with
   * the provided deviceType defaulting to 'unknown' when not supplied.
   */
  async upsertToken(userId: string, token: string, deviceType = 'unknown'): Promise<void> {
    await prisma.expoPushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, deviceType },
      // Row already exists — no mutable fields to update on this model,
      // so the update block is intentionally empty (satisfies Prisma's
      // upsert signature while performing a no-op on existing rows).
      update: {},
    })
  },
}
