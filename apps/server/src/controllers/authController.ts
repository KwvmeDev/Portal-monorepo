import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../prisma/client'
import { authService } from '../services/authService'
import { ApiError } from '../utils/ApiError'

// ─── Shared Validation Schemas ────────────────────────────────────────────────

/**
 * Password must be at least 8 characters and contain at least one digit and
 * one special character.  The same rules apply to both registration and reset.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

/** Subset of User fields returned in every auth response. */
const userSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  role: true,
  avatarUrl: true,
  universityId: true,
} as const

// ─── register ─────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Validates the email, ensures no verified account already holds it, then
 * generates and stores an OTP and sends a verification email.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address').max(255, 'Email must be at most 255 characters'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { email } = parsed.data

    // Only block if the existing account has already been verified
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing?.isEmailVerified) {
      return next(new ApiError('Email is already registered', 409, 'email_taken'))
    }

    const otp = authService.generateOtp()
    await authService.storeOtp(email, otp)
    await authService.sendVerificationEmail(email, otp)

    res.status(200).json({ message: 'Verification email sent' })
  } catch (err) {
    next(err)
  }
}

// ─── verifyEmail ──────────────────────────────────────────────────────────────

/**
 * POST /auth/verify-email
 * Consumes the OTP, validates all registration fields, creates the user record
 * and issues the first token pair.
 */
export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      otp: z.string().min(1, 'OTP is required'),
      password: passwordSchema,
      username: z
        .string()
        .min(1, 'Username is required')
        .max(30, 'Username must be at most 30 characters')
        .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores'),
      displayName: z.string().min(1, 'Display name is required').max(50, 'Display name must be at most 50 characters'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { email, otp, password, username, displayName } = parsed.data

    // Verify and consume the OTP
    const otpValid = await authService.verifyOtp(email, otp)
    if (!otpValid) {
      return next(new ApiError('Invalid or expired verification code', 400, 'invalid_otp'))
    }

    // Username must be globally unique (case-insensitive)
    const existingUsername = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    })
    if (existingUsername) {
      return next(new ApiError('Username is already taken', 409, 'username_taken'))
    }

    const passwordHash = await authService.hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        username,
        displayName,
        isEmailVerified: true,
        role: 'member',
      },
      select: userSelect,
    })

    const accessToken = authService.generateAccessToken(user.id, user.role)
    const { token: refreshToken, tokenId } = authService.generateRefreshToken(user.id)
    await authService.storeRefreshToken(user.id, tokenId)

    res.status(201).json({ accessToken, refreshToken, user })
  } catch (err) {
    next(err)
  }
}

// ─── login ────────────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Validates credentials, checks ban status, and issues a fresh token pair.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(1, 'Password is required'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { email, password } = parsed.data

    const userRecord = await prisma.user.findUnique({
      where: { email },
      select: {
        ...userSelect,
        password: true,
        isBanned: true,
        banReason: true,
      },
    })

    if (!userRecord) {
      return next(new ApiError('Invalid email or password', 401, 'invalid_credentials'))
    }

    const passwordMatch = await authService.comparePassword(password, userRecord.password)
    if (!passwordMatch) {
      return next(new ApiError('Invalid email or password', 401, 'invalid_credentials'))
    }

    if (userRecord.isBanned) {
      return next(
        new ApiError(
          `Account banned: ${userRecord.banReason ?? 'No reason provided'}`,
          403,
          'account_banned',
        ),
      )
    }

    const accessToken = authService.generateAccessToken(userRecord.id, userRecord.role)
    const { token: refreshToken, tokenId } = authService.generateRefreshToken(userRecord.id)
    await authService.storeRefreshToken(userRecord.id, tokenId)

    // Return only the public user shape (strip password, isBanned, banReason)
    const { password: _pw, isBanned: _banned, banReason: _reason, ...user } = userRecord

    res.status(200).json({ accessToken, refreshToken, user })
  } catch (err) {
    next(err)
  }
}

// ─── refresh ──────────────────────────────────────────────────────────────────

/**
 * POST /auth/refresh
 * Rotates the refresh token: revokes the old one and issues a fresh pair.
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { refreshToken: incomingToken } = parsed.data

    let userId: string
    let tokenId: string

    try {
      const result = await authService.verifyRefreshToken(incomingToken)
      userId = result.userId
      tokenId = result.tokenId
    } catch {
      return next(new ApiError('Invalid or expired refresh token', 401, 'invalid_token'))
    }

    // Revoke the old token before issuing a new one (rotation)
    await authService.revokeRefreshToken(userId, tokenId)

    // Fetch current role from DB — role may have changed since token was issued
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    if (!userRecord) {
      return next(new ApiError('User not found', 401, 'user_not_found'))
    }

    const newAccessToken = authService.generateAccessToken(userId, userRecord.role)
    const { token: newRefreshToken, tokenId: newTokenId } = authService.generateRefreshToken(userId)
    await authService.storeRefreshToken(userId, newTokenId)

    res.status(200).json({ accessToken: newAccessToken, refreshToken: newRefreshToken })
  } catch (err) {
    next(err)
  }
}

// ─── logout ───────────────────────────────────────────────────────────────────

/**
 * DELETE /auth/logout  (requires authentication via middleware)
 * Revokes the refresh token supplied in the request body if provided.
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string }

    if (refreshToken) {
      try {
        // verifyRefreshToken checks Redis existence, so already-revoked tokens
        // won't throw — we only revoke if it's still valid
        const { userId, tokenId } = await authService.verifyRefreshToken(refreshToken)
        await authService.revokeRefreshToken(userId, tokenId)
      } catch {
        // Silently ignore invalid or already-revoked refresh tokens on logout
      }
    }

    res.status(200).json({ message: 'Logged out' })
  } catch (err) {
    next(err)
  }
}

// ─── forgotPassword ───────────────────────────────────────────────────────────

/**
 * POST /auth/forgot-password
 * Always returns the same message to prevent user enumeration.  Sends an OTP
 * only if a matching verified account exists.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { email } = parsed.data

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (user) {
      const otp = authService.generateOtp()
      await authService.storeOtp(email, otp)
      await authService.sendPasswordResetEmail(email, otp)
    }

    // Identical response regardless of whether the email exists
    res.status(200).json({ message: "If that email exists, you'll receive a code" })
  } catch (err) {
    next(err)
  }
}

// ─── resetPassword ────────────────────────────────────────────────────────────

/**
 * POST /auth/reset-password
 * Verifies the OTP, updates the password hash, and invalidates all existing
 * refresh tokens for the account.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email address'),
      otp: z.string().min(1, 'OTP is required'),
      newPassword: passwordSchema,
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { email, otp, newPassword } = parsed.data

    const otpValid = await authService.verifyOtp(email, otp)
    if (!otpValid) {
      return next(new ApiError('Invalid or expired verification code', 400, 'invalid_otp'))
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (!user) {
      // OTP was valid but user doesn't exist — should not happen in normal flow
      return next(new ApiError('User not found', 404, 'user_not_found'))
    }

    const passwordHash = await authService.hashPassword(newPassword)

    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    })

    // Revoke all active sessions so stolen tokens are immediately invalidated
    await authService.revokeAllUserTokens(user.id)

    res.status(200).json({ message: 'Password reset successfully' })
  } catch (err) {
    next(err)
  }
}

// ─── checkOtp ─────────────────────────────────────────────────────────────────

/**
 * POST /auth/check-otp
 * Validates an OTP without consuming it — used by VerifyOtp screen for
 * immediate user feedback before the profile form is filled in.
 */
export async function checkOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email(),
      otp: z.string().length(6),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }
    const { email, otp } = parsed.data
    const valid = await authService.peekOtp(email, otp)
    if (!valid) {
      return next(new ApiError('Invalid or expired verification code', 400, 'invalid_otp'))
    }
    res.status(200).json({ valid: true })
  } catch (err) {
    next(err)
  }
}

// ─── changePassword ───────────────────────────────────────────────────────────

/**
 * POST /auth/change-password  (requires authentication)
 * Verifies the caller's current password then replaces it with a new hash.
 * Returns 204 on success so callers need not parse a body.
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z
        .string()
        .min(8, 'New password must be at least 8 characters'),
    })

    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    const { currentPassword, newPassword } = parsed.data

    // Fetch the stored hash — only the password field is needed
    const userRecord = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { password: true },
    })

    if (!userRecord) {
      return next(new ApiError('User not found', 404, 'user_not_found'))
    }

    const valid = await authService.comparePassword(currentPassword, userRecord.password)
    if (!valid) {
      return next(new ApiError('Current password is incorrect', 400, 'invalid_credentials'))
    }

    const newHash = await authService.hashPassword(newPassword)

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: newHash },
    })

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

// ─── checkUsername ────────────────────────────────────────────────────────────

/**
 * GET /auth/check-username?username=...
 * Returns { available: true } if the username is not already taken.
 * The check is case-insensitive to match how uniqueness is enforced on create.
 */
export async function checkUsername(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { username } = req.query

    if (!username || typeof username !== 'string') {
      return next(new ApiError('username query parameter is required', 400, 'validation_error'))
    }

    const existing = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    })

    res.status(200).json({ available: existing === null })
  } catch (err) {
    next(err)
  }
}
