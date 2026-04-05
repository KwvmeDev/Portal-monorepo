import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { ApiError } from '../utils/ApiError'
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  generateSignedUploadParams,
  uploadImage,
} from '../services/mediaService'

// ─── upload ───────────────────────────────────────────────────────────────────

/**
 * POST /api/media/upload  (requires authentication + multer single('file'))
 *
 * Accepts a multipart/form-data request containing a single image file in the
 * 'file' field. Multer enforces memory storage, a 5 MB size cap, and image/*
 * MIME filtering before this handler runs.
 *
 * On success returns 200 { url: string } — the Cloudinary secure_url.
 * Returns 400 when no file field is present in the request.
 */
export async function upload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    // req.file is undefined when multer found no 'file' part in the multipart body
    if (!req.file) {
      return next(new ApiError('No file attached', 400, 'no_file'))
    }

    const secureUrl = await uploadImage(req.file.buffer, req.file.mimetype)

    res.status(200).json({ url: secureUrl })
  } catch (err) {
    next(err)
  }
}

// ─── Validation Schema ────────────────────────────────────────────────────────

const signSchema = z.object({
  fileType: z.enum(ALLOWED_FILE_TYPES, {
    errorMap: () => ({
      message: `fileType must be one of: ${ALLOWED_FILE_TYPES.join(', ')}`,
    }),
  }),
  fileSize: z
    .number({ invalid_type_error: 'fileSize must be a number' })
    .int('fileSize must be an integer')
    .positive('fileSize must be positive')
    .max(MAX_FILE_SIZE_BYTES, `fileSize must not exceed ${MAX_FILE_SIZE_BYTES} bytes (10 MB)`),
})

// ─── sign ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/media/sign  (requires authentication)
 *
 * Body: { fileType: string, fileSize: number }
 *
 * Validates the file type and size, then generates Cloudinary signed upload
 * parameters so the client can upload directly without passing binary data
 * through this server.
 *
 * Response: { signature, timestamp, folder, cloudName, apiKey }
 */
export async function sign(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by the authenticate middleware applied in the route
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'))
    }

    const parsed = signSchema.safeParse(req.body)
    if (!parsed.success) {
      return next(new ApiError(parsed.error.errors[0].message, 400, 'validation_error'))
    }

    // fileType and fileSize are validated — generate signed params for this user
    const params = generateSignedUploadParams(req.user.id)

    res.status(200).json(params)
  } catch (err) {
    next(err)
  }
}
