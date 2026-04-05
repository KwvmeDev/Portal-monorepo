import { createHash } from 'crypto'
import { redis } from '../config/redis'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LinkPreview {
  title: string | null
  description: string | null
  imageUrl: string | null
  url: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Redis TTL for cached link previews — 24 hours in seconds */
const CACHE_TTL_SECONDS = 86_400

/** Fetch timeout — abort if the target URL takes longer than 5 seconds */
const FETCH_TIMEOUT_MS = 5_000

/** Cache key prefix to avoid collisions with other Redis namespaces */
const CACHE_KEY_PREFIX = 'link_preview:'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a deterministic Redis key for a given URL.
 * Uses SHA-256 so the key length is always fixed regardless of URL length.
 */
function buildCacheKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex')
  return `${CACHE_KEY_PREFIX}${hash}`
}

/**
 * Extracts the content of an Open Graph meta tag from raw HTML.
 * Matches both `property="og:xxx"` and `name="og:xxx"` attribute orderings.
 */
function extractOgTag(html: string, property: string): string | null {
  // Match <meta property="og:xxx" content="..."> in any attribute order
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const reversePattern = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  )
  return (
    html.match(pattern)?.[1]?.trim() ??
    html.match(reversePattern)?.[1]?.trim() ??
    null
  )
}

/**
 * Extracts the text content of the <title> element from raw HTML.
 */
function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null
}

/**
 * Extracts the content of <meta name="description"> from raw HTML.
 */
function extractMetaDescription(html: string): string | null {
  const pattern =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
  const reversePattern =
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i
  return (
    html.match(pattern)?.[1]?.trim() ??
    html.match(reversePattern)?.[1]?.trim() ??
    null
  )
}

/**
 * Parses a raw HTML string into a LinkPreview object.
 *
 * Priority:
 *   title      → og:title   → <title>
 *   description → og:description → <meta name="description">
 *   imageUrl   → og:image   → null (no fallback for images)
 *   url        → og:url     → the original requested URL
 */
function parseHtml(html: string, originalUrl: string): LinkPreview {
  const ogTitle = extractOgTag(html, 'og:title')
  const ogDescription = extractOgTag(html, 'og:description')
  const ogImage = extractOgTag(html, 'og:image')
  const ogUrl = extractOgTag(html, 'og:url')

  return {
    title: ogTitle ?? extractTitle(html),
    description: ogDescription ?? extractMetaDescription(html),
    imageUrl: ogImage,
    url: ogUrl ?? originalUrl,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches and parses link preview metadata for the given URL.
 *
 * - Returns cached result immediately if available (Redis, 24h TTL).
 * - Fetches the URL server-side with a 5-second abort timeout.
 * - Parses OG tags with fallback to <title> and <meta name="description">.
 * - Stores parsed result in Redis before returning.
 *
 * Throws a plain Error (not ApiError) for invalid or unreachable URLs.
 * Callers are responsible for mapping this to the appropriate HTTP response.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const cacheKey = buildCacheKey(url)

  // Return cached result immediately — no network call needed
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached) as LinkPreview
  }

  // Abort the fetch if the target URL is slow or unresponsive
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identify as a standard browser user-agent so servers don't block us
        'User-Agent':
          'Mozilla/5.0 (compatible; PortalBot/1.0; +https://portal.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // Only parse the first 200 KB — OG tags are always in <head>
    const buffer = await response.arrayBuffer()
    const slice = buffer.slice(0, 200_000)
    html = new TextDecoder('utf-8', { fatal: false }).decode(slice)
  } catch (err) {
    // Normalise all network/timeout/HTTP errors into a single message
    // so internal details are never forwarded to the client.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('URL fetch timed out')
    }
    throw new Error('URL is invalid or unreachable')
  } finally {
    clearTimeout(timeoutId)
  }

  const preview = parseHtml(html, url)

  // Cache asynchronously — a Redis failure here should not block the response
  redis
    .set(cacheKey, JSON.stringify(preview), 'EX', CACHE_TTL_SECONDS)
    .catch((err: Error) => {
      console.error('[linkPreviewService] Redis cache write failed:', err.message)
    })

  return preview
}
