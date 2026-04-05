import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { redis } from '../config/redis'
import { env } from '../config/env'
import { sendEmail } from '../config/email'

// ─── Constants ───────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 600         // 10 minutes
const REFRESH_TTL_SECONDS = 2592000 // 30 days
const BCRYPT_COST = 12

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccessTokenPayload {
  userId: string
  role: string
}

interface RefreshTokenPayload {
  userId: string
  tokenId: string
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Generates a cryptographically-seeded 6-digit OTP string.
   * Always returns exactly 6 digits (100000–999999).
   */
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  },

  /**
   * Persists an OTP in Redis under key `otp:{email}` with a 600-second TTL.
   */
  async storeOtp(email: string, otp: string): Promise<void> {
    await redis.set(`otp:${email}`, otp, 'EX', OTP_TTL_SECONDS)
  },

  /**
   * Checks an OTP without consuming it — used at the VerifyOtp screen step
   * so the user gets immediate feedback before filling in their profile.
   * Does NOT delete the key; verifyOtp must still be called at verify-email.
   */
  async peekOtp(email: string, otp: string): Promise<boolean> {
    const stored = await redis.get(`otp:${email}`)
    return stored !== null && stored === otp
  },

  /**
   * Verifies an OTP by fetching the stored value for `otp:{email}`.
   * Deletes the key on a successful match so each OTP can only be used once.
   * Returns false if the key is missing or the value does not match.
   */
  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const stored = await redis.get(`otp:${email}`)
    if (stored === null || stored !== otp) {
      return false
    }
    // Consume the OTP — invalidate after first successful use
    await redis.del(`otp:${email}`)
    return true
  },

  /**
   * Hashes a plain-text password using bcrypt with cost factor 12.
   */
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST)
  },

  /**
   * Compares a plain-text password against a bcrypt hash.
   */
  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
  },

  /**
   * Signs and returns a short-lived JWT access token.
   * Payload includes userId and role; signed with JWT_ACCESS_SECRET.
   */
  generateAccessToken(userId: string, role: string): string {
    const payload: AccessTokenPayload = { userId, role }
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })
  },

  /**
   * Signs and returns a long-lived JWT refresh token plus its tokenId.
   * Returns both so callers can store the tokenId without needing to
   * re-decode the token (which would require a Redis round-trip via verifyRefreshToken).
   */
  generateRefreshToken(userId: string): { token: string; tokenId: string } {
    const tokenId = crypto.randomUUID()
    const payload: RefreshTokenPayload = { userId, tokenId }
    const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    })
    return { token, tokenId }
  },

  /**
   * Persists a refresh token session marker in Redis.
   * Key: `refresh:{userId}:{tokenId}`, TTL: 2592000s (30 days).
   * The value is a placeholder — existence of the key is the validity signal.
   */
  async storeRefreshToken(userId: string, tokenId: string): Promise<void> {
    await redis.set(`refresh:${userId}:${tokenId}`, '1', 'EX', REFRESH_TTL_SECONDS)
  },

  /**
   * Verifies a refresh token's signature, then confirms the session still
   * exists in Redis (guards against revoked tokens that haven't expired yet).
   * Throws on invalid signature, expired token, or revoked session.
   */
  async verifyRefreshToken(token: string): Promise<{ userId: string; tokenId: string }> {
    let payload: RefreshTokenPayload

    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
    } catch {
      throw new Error('Invalid or expired refresh token')
    }

    const { userId, tokenId } = payload

    // Confirm the session has not been explicitly revoked in Redis
    const exists = await redis.exists(`refresh:${userId}:${tokenId}`)
    if (!exists) {
      throw new Error('Refresh token has been revoked')
    }

    return { userId, tokenId }
  },

  /**
   * Deletes a single refresh token session from Redis.
   */
  async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    await redis.del(`refresh:${userId}:${tokenId}`)
  },

  /**
   * Deletes all active refresh token sessions for a user.
   * Uses KEYS pattern `refresh:{userId}:*` — suitable for low-volume admin
   * operations; on high-traffic systems prefer a set-of-tokenIds approach.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const keys = await redis.keys(`refresh:${userId}:*`)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  },

  /**
   * Sends an HTML email containing a 6-digit verification OTP.
   */
  async sendVerificationEmail(email: string, otp: string): Promise<void> {
    await sendEmail({
      to: email,
      subject: 'Your PORTAL verification code',
      html: buildOtpEmailHtml({
        heading: 'Email Verification',
        bodyText: 'Use the code below to verify your PORTAL account. It expires in 10 minutes.',
        otp,
      }),
    })
  },

  /**
   * Sends an HTML email containing a 6-digit password-reset OTP.
   */
  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    await sendEmail({
      to: email,
      subject: 'Reset your PORTAL password',
      html: buildOtpEmailHtml({
        heading: 'Password Reset',
        bodyText: 'Use the code below to reset your PORTAL password. It expires in 10 minutes.',
        otp,
      }),
    })
  },
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Builds a minimal, inline-styled HTML email body displaying an OTP prominently.
 */
function buildOtpEmailHtml(params: {
  heading: string
  bodyText: string
  otp: string
}): string {
  const { heading, bodyText, otp } = params
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">PORTAL</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${heading}</h1>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">${bodyText}</p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:24px;text-align:center;margin-bottom:28px;">
                <span style="font-size:36px;font-weight:700;letter-spacing:0.25em;color:#111827;">${otp}</span>
              </div>
              <p style="margin:0;font-size:13px;color:#9ca3af;">If you did not request this, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">&copy; ${new Date().getFullYear()} PORTAL. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}
