import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { createCheckoutUrl } from '@/lib/services/lemonsqueezy';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) return apiError('User email not found', 'AUTH_ERROR', 400);

  try {
    const url = await createCheckoutUrl(userId, user.email);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[billing/checkout]', err);
    return apiError('Checkout creation failed', 'BILLING_ERROR', 503);
  }
}
