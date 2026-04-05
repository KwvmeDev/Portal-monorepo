import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth'
import * as mediaController from '../controllers/mediaController'

/**
 * Media routes — mounted at /api/media in routes/index.ts
 */
const router: Router = Router()

// Multer instance scoped to this router.
// - memoryStorage: keeps the file in req.file.buffer; no disk I/O on the server.
// - fileSize 5 MB: rejects oversized uploads before they reach the handler.
// - fileFilter: rejects non-image MIME types with a 400-level multer error.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept only image/* — multer calls cb(null, false) to silently skip, but
    // passing an Error surfaces a clear rejection message instead.
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only image/* is allowed.`))
    }
  },
})

// POST /api/media/sign
// Generates Cloudinary signed upload parameters for authenticated users.
// The client uses these to upload directly to Cloudinary (server-side proxy
// of binary data is intentionally avoided).
router.post('/sign', authenticate, mediaController.sign)

// POST /api/media/upload
// Accepts multipart/form-data with a single 'file' field. Multer validates
// size and MIME type before the handler runs. Returns { url } on success.
router.post('/upload', authenticate, upload.single('file'), mediaController.upload)

export default router
