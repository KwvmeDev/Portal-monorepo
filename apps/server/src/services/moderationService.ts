import Anthropic from '@anthropic-ai/sdk'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  flagged: boolean
  reason?: string
}

// ─── Moderation Service ───────────────────────────────────────────────────────

/**
 * Calls Claude Haiku to check whether the provided text violates content
 * policy (hate speech, explicit sexual content, graphic violence, harassment,
 * or spam).
 *
 * IMPORTANT: This function is intentionally fail-open — it returns
 * { flagged: false } on any error so that AI moderation never blocks post
 * creation when the service is unavailable or returns unexpected output.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:
        'You are a content moderation assistant. Respond only with valid JSON: {"flagged": boolean, "reason": "string or null"}. Flag content with hate speech, explicit sexual content, graphic violence, harassment, or spam.',
      messages: [{ role: 'user', content: `Moderate this post: ${text}` }],
    })

    // The model is instructed to always return a single text block with JSON.
    const raw = message.content[0]
    if (raw.type !== 'text') {
      return { flagged: false }
    }

    const result = JSON.parse(raw.text) as { flagged: boolean; reason?: string | null }

    return {
      flagged: Boolean(result.flagged),
      reason: result.reason ?? undefined,
    }
  } catch {
    // Moderation must never block post creation — silently swallow all errors.
    return { flagged: false }
  }
}

export const moderationService = { moderateContent }
