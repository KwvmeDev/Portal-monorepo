/**
 * uploadService.ts — Cloudinary direct-upload helper.
 *
 * Flow:
 *   1. Compress the local image with expo-image-manipulator (client-side,
 *      never sends binary to our server).
 *   2. Fetch Cloudinary signed-upload params from POST /api/media/sign.
 *   3. POST the file directly to Cloudinary using the signed params.
 *   4. Return { secureUrl, publicId, width, height } to the caller.
 *
 * Default compression: maxWidth 1200px, quality 0.85, JPEG output.
 */
import * as ImageManipulator from 'expo-image-manipulator'
import { api } from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  secureUrl: string
  publicId: string
  width: number
  height: number
}

export interface UploadOptions {
  /** Maximum width in pixels; image is resized proportionally. Default: 1200. */
  maxWidth?: number
  /** Maximum height in pixels; only applied when both dimensions are provided. */
  maxHeight?: number
  /** JPEG compression quality in range [0, 1]. Default: 0.85. */
  quality?: number
}

/**
 * Signed parameters returned by POST /api/media/sign.
 * Generated server-side with cloudinary.utils.api_sign_request.
 */
interface SignParams {
  signature: string
  timestamp: number
  folder: string
  cloudName: string
  apiKey: string
}

/**
 * Raw shape of a successful Cloudinary upload response.
 * Only the fields we actually use are declared; the full response contains more.
 */
interface CloudinaryUploadResponse {
  secure_url: string
  public_id: string
  width: number
  height: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_WIDTH = 1200
const DEFAULT_QUALITY = 0.85

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compress a local image URI using expo-image-manipulator.
 *
 * Always outputs JPEG so the MIME type is predictable when building FormData.
 * Resize is width-only (preserves aspect ratio). If maxHeight is also provided,
 * both constraints are passed and the manipulator picks the limiting dimension.
 */
async function compressImage(
  localUri: string,
  options: Required<Pick<UploadOptions, 'maxWidth' | 'quality'>> & Pick<UploadOptions, 'maxHeight'>,
): Promise<ImageManipulator.ImageResult> {
  const resizeAction: ImageManipulator.Action = options.maxHeight
    ? { resize: { width: options.maxWidth, height: options.maxHeight } }
    : { resize: { width: options.maxWidth } }

  return ImageManipulator.manipulateAsync(
    localUri,
    [resizeAction],
    {
      compress: options.quality,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  )
}

/**
 * Request signed upload credentials from our backend.
 *
 * The server validates fileType / fileSize and generates a Cloudinary
 * signature so the client can upload directly without an API secret.
 */
async function fetchSignedParams(estimatedSize: number): Promise<SignParams> {
  return api.post<SignParams>('/media/sign', {
    fileType: 'image/jpeg',
    fileSize: estimatedSize,
  })
}

/**
 * Build the multipart FormData body required by Cloudinary's upload endpoint.
 *
 * `file` must be cast to `any` because React Native's FormData accepts a
 * `{ uri, type, name }` object but the web FormData type definition does not.
 */
function buildCloudinaryFormData(
  compressedUri: string,
  params: SignParams,
): FormData {
  const formData = new FormData()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formData.append('file', { uri: compressedUri, type: 'image/jpeg', name: 'upload.jpg' } as any)
  formData.append('signature', params.signature)
  formData.append('timestamp', String(params.timestamp))
  formData.append('folder', params.folder)
  formData.append('api_key', params.apiKey)
  return formData
}

/**
 * Upload FormData to Cloudinary and parse the response.
 *
 * Throws a descriptive error if the upload fails so callers receive
 * actionable messages rather than raw HTTP status codes.
 */
async function postToCloudinary(
  formData: FormData,
  cloudName: string,
): Promise<CloudinaryUploadResponse> {
  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    // Attempt to surface the Cloudinary error message when available
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: { message?: string } }
      if (body?.error?.message) {
        detail = body.error.message
      }
    } catch {
      // Ignore JSON parse failure; use the HTTP status detail above
    }
    throw new Error(`Cloudinary upload failed: ${detail}`)
  }

  return response.json() as Promise<CloudinaryUploadResponse>
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compress a local image URI and upload it to Cloudinary via signed params.
 *
 * @param localUri  - File URI returned by expo-image-picker or similar.
 * @param options   - Optional compression overrides (maxWidth, quality, maxHeight).
 * @returns         - { secureUrl, publicId, width, height } from Cloudinary.
 *
 * Usage examples:
 *   Post images:  uploadImage(uri, { maxWidth: 1200, quality: 0.85 })
 *   Avatars:      uploadImage(uri, { maxWidth: 400, quality: 0.9 })
 *   Org banners:  uploadImage(uri, { maxWidth: 1600, quality: 0.85 })
 */
export async function uploadImage(
  localUri: string,
  options?: UploadOptions,
): Promise<UploadResult> {
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH
  const quality = options?.quality ?? DEFAULT_QUALITY
  const maxHeight = options?.maxHeight

  // Step 1: Compress client-side — reduces payload size before any network call
  const compressed = await compressImage(localUri, { maxWidth, quality, maxHeight })

  // Step 2: Fetch server-signed upload credentials.
  // Use a rough byte estimate (width × height × 3 bytes per pixel for JPEG).
  const estimatedSize = compressed.width * compressed.height * 3
  const signParams = await fetchSignedParams(estimatedSize)

  // Step 3: Build FormData and upload directly to Cloudinary
  const formData = buildCloudinaryFormData(compressed.uri, signParams)
  const cloudinaryData = await postToCloudinary(formData, signParams.cloudName)

  return {
    secureUrl: cloudinaryData.secure_url,
    publicId: cloudinaryData.public_id,
    width: cloudinaryData.width,
    height: cloudinaryData.height,
  }
}
