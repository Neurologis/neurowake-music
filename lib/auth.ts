import { createServerClient } from './supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function apiError(
  message: string,
  code: string,
  status: number
): NextResponse {
  return NextResponse.json({ error: message, code, status }, { status });
}

export async function requireAuth(req: NextRequest): Promise<
  | { userId: string; error: null }
  | { userId: null; error: NextResponse }
> {
  const supabase = createServerClient();
  // Use getUser() (server-validated) instead of getSession() (reads JWT locally).
  // This prevents FK violations where a stale cookie returns a user_id that
  // doesn't yet exist in auth.users after email confirmation.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      userId: null,
      error: apiError('Authentication required', 'AUTH_REQUIRED', 401),
    };
  }

  return { userId: user.id, error: null };
}

export function checkRateLimit(
  identifier: string,
  maxRequests = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

export async function requireAuthWithRateLimit(
  req: NextRequest,
  maxRequests = 10
): Promise<
  | { userId: string; error: null }
  | { userId: null; error: NextResponse }
> {
  const authResult = await requireAuth(req);
  if (authResult.error) return authResult;

  const allowed = checkRateLimit(
    `ai:${authResult.userId}`,
    maxRequests,
    60_000
  );

  if (!allowed) {
    return {
      userId: null,
      error: apiError('Rate limit exceeded', 'RATE_LIMIT', 429),
    };
  }

  return authResult;
}
