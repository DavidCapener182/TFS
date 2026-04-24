import type { NextRequest } from 'next/server'

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function getClientAddress(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export function checkRateLimit(
  request: NextRequest,
  key: string,
  options: { limit: number; windowMs: number }
) {
  const now = Date.now()
  const clientKey = `${key}:${getClientAddress(request)}`
  const current = buckets.get(clientKey)

  if (!current || current.resetAt <= now) {
    buckets.set(clientKey, {
      count: 1,
      resetAt: now + options.windowMs,
    })
    return { allowed: true, remaining: options.limit - 1, resetAt: now + options.windowMs }
  }

  if (current.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt }
  }

  current.count += 1
  return { allowed: true, remaining: options.limit - current.count, resetAt: current.resetAt }
}
