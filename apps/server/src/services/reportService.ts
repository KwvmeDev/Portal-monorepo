import { prisma } from '../prisma/client'
import { ApiError } from '../utils/ApiError'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Valid values that callers may pass as targetType.
 * Must match the string literals stored in report.targetType.
 */
export type ReportTargetType = 'post' | 'comment' | 'user'

/**
 * Moderator action on a report:
 *  - 'approve' — report reviewed but no action taken (maps to ReportStatus.reviewed)
 *  - 'remove'  — report actioned; content/user is removed/banned (maps to ReportStatus.actioned)
 */
export type ReportAction = 'approve' | 'remove'

// ─── Report Service ───────────────────────────────────────────────────────────

export const reportService = {
  /**
   * Creates a new Report row for the given reporter against a piece of content
   * or user.
   *
   * Throws 409 when the same reporter has already reported the exact same
   * targetId — duplicate reports from the same user add no moderation value
   * and would inflate counters.
   */
  async createReport(
    reporterId: string,
    targetId: string,
    targetType: string,
    reason: string,
    details?: string,
  ) {
    // Guard: one report per (reporter, target) pair
    const existing = await prisma.report.findFirst({
      where: { reporterId, targetId },
      select: { id: true },
    })

    if (existing) {
      throw ApiError.conflict('You have already reported this content')
    }

    const report = await prisma.report.create({
      data: {
        reporterId,
        targetId,
        targetType,
        // reason must match the ReportReason enum — Prisma will throw a
        // runtime error if an invalid string is supplied, which Express will
        // surface as a 500 unless we validate upstream in the controller.
        reason: reason as any,
        details: details ?? null,
      },
      select: {
        id: true,
        reporterId: true,
        targetId: true,
        targetType: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
      },
    })

    return report
  },

  /**
   * Returns a paginated list of reports (PAGE_SIZE = 20), ordered by
   * createdAt DESC, optionally filtered by status (defaults to 'pending').
   *
   * Each row includes a minimal reporter sub-object for display in the
   * moderation dashboard.
   *
   * Cursor is the id of the last item on the previous page (keyset
   * pagination — avoids OFFSET drift on a live dataset).
   */
  async listReports(cursor?: string, status?: string) {
    // Default to pending so the moderation queue shows the actionable backlog.
    const statusFilter = (status ?? 'pending') as any

    const rows = await prisma.report.findMany({
      where: { status: statusFilter },
      select: {
        id: true,
        targetId: true,
        targetType: true,
        reason: true,
        details: true,
        status: true,
        reviewedBy: true,
        createdAt: true,
        reporter: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasNextPage = rows.length > PAGE_SIZE
    const pageRows = rows.slice(0, PAGE_SIZE)
    const lastRow = pageRows[pageRows.length - 1]
    const nextCursor = hasNextPage && lastRow ? lastRow.id : null

    return { reports: pageRows, nextCursor }
  },

  /**
   * Resolves a report: marks it reviewed or actioned, and optionally removes
   * the reported content / bans the user when action is 'remove'.
   *
   * All mutations run inside a single Prisma interactive transaction so that
   * the report status update and the content mutation are atomic.
   *
   * Throws 404 when the reportId does not exist.
   *
   * Status mapping:
   *   action='approve' → ReportStatus.reviewed  (acknowledged, no action)
   *   action='remove'  → ReportStatus.actioned   (content actioned)
   */
  async resolveReport(
    reportId: string,
    moderatorId: string,
    action: ReportAction,
  ): Promise<void> {
    // Load report to know targetType before entering the transaction
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, targetId: true, targetType: true },
    })

    if (!report) {
      throw ApiError.notFound('Report not found')
    }

    const newStatus = action === 'remove' ? 'actioned' : 'reviewed'

    await prisma.$transaction(async (tx) => {
      // 1. Update the report status and record the moderator who resolved it
      await tx.report.update({
        where: { id: reportId },
        data: {
          status: newStatus as any,
          reviewedBy: moderatorId,
        },
      })

      // 2. When removing content, apply the side-effect on the target entity
      if (action === 'remove') {
        if (report.targetType === 'post') {
          await tx.post.update({
            where: { id: report.targetId },
            data: { isRemoved: true },
          })
        } else if (report.targetType === 'comment') {
          await tx.comment.update({
            where: { id: report.targetId },
            data: { isRemoved: true },
          })
        } else if (report.targetType === 'user') {
          await tx.user.update({
            where: { id: report.targetId },
            data: { isBanned: true },
          })
        }
      }
    })
  },
}
