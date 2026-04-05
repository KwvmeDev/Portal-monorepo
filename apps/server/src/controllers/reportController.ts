import { Request, Response, NextFunction } from 'express'
import { reportService, type ReportAction } from '../services/reportService'
import { ApiError } from '../utils/ApiError'

// ─── createReport ─────────────────────────────────────────────────────────────

/**
 * POST /api/reports  (authenticated)
 *
 * Body: { targetId: string, targetType: string, reason: string, details?: string }
 *
 * Creates a new report row. Returns 201 with the created report on success.
 * Returns 409 if the authenticated user has already reported the same targetId.
 */
export async function createReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const { targetId, targetType, reason, details } = req.body as {
      targetId?: string
      targetType?: string
      reason?: string
      details?: string
    }

    if (!targetId || !targetType || !reason) {
      return next(ApiError.badRequest('targetId, targetType, and reason are required'))
    }

    const report = await reportService.createReport(
      req.user.id,
      targetId,
      targetType,
      reason,
      details,
    )

    res.status(201).json(report)
  } catch (err) {
    next(err)
  }
}

// ─── listReports ──────────────────────────────────────────────────────────────

/**
 * GET /api/reports  (authenticated, super_admin only)
 *
 * Query: ?cursor=<report id>  &status=<ReportStatus>
 *
 * Returns a paginated list of reports for the moderation dashboard.
 * Defaults to status='pending' when no status query param is supplied.
 * Returns 403 if the caller is not a super_admin.
 */
export async function listReports(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    if (req.user.role !== 'super_admin') {
      return next(ApiError.forbidden('Super admin access required'))
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined

    const page = await reportService.listReports(cursor, status)

    res.status(200).json(page)
  } catch (err) {
    next(err)
  }
}

// ─── resolveReport ────────────────────────────────────────────────────────────

/**
 * PATCH /api/reports/:id  (authenticated, super_admin only)
 *
 * Body: { action: 'approve' | 'remove' }
 *
 * Resolves a report by approving (no content action) or removing the reported
 * content / banning the reported user. Returns 204 on success.
 * Returns 403 if the caller is not a super_admin.
 * Returns 404 if the report does not exist.
 */
export async function resolveReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    if (req.user.role !== 'super_admin') {
      return next(ApiError.forbidden('Super admin access required'))
    }

    const { id } = req.params
    const { action } = req.body as { action?: string }

    if (!action || (action !== 'approve' && action !== 'remove')) {
      return next(ApiError.badRequest("action must be 'approve' or 'remove'"))
    }

    await reportService.resolveReport(id, req.user.id, action as ReportAction)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
