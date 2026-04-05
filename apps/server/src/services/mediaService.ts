import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'

// Ensure cloudinary is configured with env vars before any calls
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
})

/** File MIME types permitted for upload. */
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number]

/** Maximum allowed file size: 10 MB */
export const MAX_FILE_SIZE_BYTES = 10_485_760 // 10 * 1024 * 1024

// ─── uploadImage ─────────────────────────────────────────────────────────────

/**
 * Uploads an image buffer to Cloudinary via upload_stream and returns the
 * secure URL of the stored asset.
 *
 * upload_stream is used instead of upload() because the file lives in memory
 * (multer memoryStorage) rather than on disk, so there is no local path to
 * hand to the disk-based upload method.
 *
 * @param fileBuffer - Raw file bytes from multer's req.file.buffer
 * @param mimetype   - MIME type from req.file.mimetype, forwarded to Cloudinary
 * @returns          - Cloudinary secure_url for the uploaded image
 */
export function uploadImage(fileBuffer: Buffer, mimetype: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: 'portal',
        // Pass the client MIME type so Cloudinary can derive the format correctly
        format: mimetype.split('/')[1] ?? undefined,
      },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed: no result returned'))
        }
        resolve(result.secure_url)
      },
    )

    // Write the in-memory buffer into the upload stream and signal EOF
    uploadStream.end(fileBuffer)
  })
}

// ─── generateSignedUploadParams ──────────────────────────────────────────────

export interface SignedUploadParams {
  signature: string
  timestamp: number
  folder: string
  cloudName: string
  apiKey: string
}

/**
 * Generates Cloudinary signed upload parameters for a specific user.
 *
 * The client uses these params to upload directly to Cloudinary —
 * the server never handles binary data.
 *
 * @param userId  - Authenticated user's ID, used to namespace the upload folder
 * @returns       - Signed params the client forwards to Cloudinary's upload API
 */
export function generateSignedUploadParams(userId: string): SignedUploadParams {
  const timestamp = Math.round(Date.now() / 1000)
  const folder = `portal/uploads/${userId}`

  // Sign the upload parameters server-side using the Cloudinary API secret
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET,
  )

  return {
    signature,
    timestamp,
    folder,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
  }
}
