// Must be the very first import so env vars are available to all subsequent modules
import 'dotenv/config'

// Validates all required env vars on startup — exits with error if any are missing
import './config/env'

import http from 'http'
import app from './app'
import { redis } from './config/redis'

// Cloudinary and email transporter initialize on import via their module-level config calls
import './config/cloudinary'
import './config/email'

const PORT = process.env.PORT ?? 3000

const server = http.createServer(app)

server.listen(PORT, () => {
  console.log(`[server] PORTAL API running on port ${PORT} (${process.env.NODE_ENV ?? 'development'})`)
})

// Graceful shutdown — allow in-flight requests to complete before closing
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully')
  server.close(() => {
    console.log('[server] HTTP server closed')
    redis.disconnect()
    process.exit(0)
  })
})
