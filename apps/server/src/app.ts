import express, { type Application } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import router from './routes/index'
import { notFound } from './middleware/notFound'
import { errorHandler } from './middleware/errorHandler'

/**
 * Express application factory.
 *
 * Intentionally has NO listen() call — the http.Server is created in index.ts.
 * This keeps the app testable (tests can import and call endpoints without
 * binding to a port).
 */
const app: Application = express()

// Security headers — sets sensible defaults like X-Content-Type-Options, HSTS, etc.
app.use(helmet())

// CORS — allow configured frontend origin plus all local dev origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:8081',
  'http://10.0.2.2:8081',
  'http://127.0.0.1:8081',
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, Postman)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(null, true) // dev: allow all — tighten in production
    },
    credentials: true,
  }),
)

// HTTP request logging (method, path, status, duration)
app.use(morgan('dev'))

// Body parsing — JSON payloads up to 10 MB (covers base64-encoded image uploads)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// API routes
app.use('/api', router)

// 404 handler — catches any request that didn't match a route above
app.use(notFound)

// Global error handler — must be last so it receives errors forwarded via next(err)
app.use(errorHandler)

export default app
