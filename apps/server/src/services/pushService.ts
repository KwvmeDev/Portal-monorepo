import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk'
import { prisma } from '../prisma/client'

// ─── Singleton Expo client ────────────────────────────────────────────────────

// One Expo instance is created at module load and reused for all calls.
// This avoids the overhead of re-instantiating the client and keeps the
// internal HTTP agent alive for connection pooling.
const expo = new Expo()

// ─── Push Service ─────────────────────────────────────────────────────────────

export const pushService = {
  /**
   * Sends a push notification to every registered Expo token for the given
   * user.
   *
   * Behaviour:
   * - Silently no-ops when the user has no registered tokens.
   * - Automatically deletes any token that Expo reports as DeviceNotRegistered
   *   so stale entries do not accumulate in the database.
   *
   * @param userId - The recipient's user ID.
   * @param title  - Notification title shown in the device tray.
   * @param body   - Notification body text.
   * @param data   - Optional arbitrary data payload forwarded to the app.
   */
  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    // Fetch all registered tokens for the user.
    const tokenRows = await prisma.expoPushToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    })

    // Nothing to do when the user has no registered devices.
    if (tokenRows.length === 0) return

    // Filter out any tokens that are not valid Expo push tokens before
    // building the message batch. This guards against malformed data that
    // would cause the SDK to throw synchronously.
    const validRows = tokenRows.filter((row) => Expo.isExpoPushToken(row.token))

    if (validRows.length === 0) return

    // Build one message per token, keeping a parallel structure so tickets can
    // be matched back to their source token for deletion on error.
    const messages: ExpoPushMessage[] = validRows.map((row) => ({
      to: row.token,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }))

    // Expo recommends chunking large batches to stay within its rate limits.
    const chunks = expo.chunkPushNotifications(messages)

    // Track which DB row IDs should be removed due to DeviceNotRegistered errors.
    const invalidDbIds: string[] = []

    for (const chunk of chunks) {
      let tickets: ExpoPushTicket[]

      try {
        tickets = await expo.sendPushNotificationsAsync(chunk)
      } catch {
        // Network / server errors should not crash the caller. Log and move on.
        continue
      }

      // Match each ticket back to the corresponding validRows entry.
      // expo.chunkPushNotifications preserves order within each chunk and
      // chunks are slices of the original messages array, so the ticket at
      // index i within this chunk corresponds to validRows at the matching
      // offset within the original messages array.
      //
      // We reconstruct the offset by finding where this chunk's first message
      // sits inside the full messages array via its `to` field. Because a
      // user could theoretically register the same token twice (unlikely given
      // the unique constraint) we use the order-preserving index approach:
      // tickets[i] corresponds to chunk[i].to, which we can look up in validRows.
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i]
        const tokenValue = (chunk[i] as ExpoPushMessage).to as string

        if (
          ticket.status === 'error' &&
          (ticket as { details?: { error?: string } }).details?.error === 'DeviceNotRegistered'
        ) {
          // Find the DB row whose token matches this message's `to` field.
          const row = validRows.find((r) => r.token === tokenValue)
          if (row) {
            invalidDbIds.push(row.id)
          }
        }
      }
    }

    // Bulk-delete all tokens Expo flagged as no longer registered.
    if (invalidDbIds.length > 0) {
      await prisma.expoPushToken.deleteMany({
        where: { id: { in: invalidDbIds } },
      })
    }
  },
}
