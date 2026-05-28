import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * PKCE auth callback — exchanges the one-time code Supabase appends to the
 * confirmation/magic-link URL for a real session cookie.
 *
 * Flow:
 *   1. User clicks confirmation link in their email
 *   2. Supabase redirects to  /auth/callback?code=<pkce_code>[&next=/somewhere]
 *   3. This handler exchanges the code for a session
 *   4. We redirect to `next` (defaults to /app)
 *   5. app/app/layout.tsx checks onboarding_complet and bounces new users → /onboarding
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/app';

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Exchange failed (expired link, already used, etc.) → back to login
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(new URL('/login?error=link_expired', origin));
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
