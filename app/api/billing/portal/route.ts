import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { getCustomerPortalUrl } from '@/lib/services/lemonsqueezy';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: abonnement } = await supabase
    .from('abonnements')
    .select('ls_customer_id')
    .eq('user_id', userId)
    .single();

  if (!abonnement?.ls_customer_id) {
    return apiError('No active subscription', 'NO_SUBSCRIPTION', 400);
  }

  try {
    const url = await getCustomerPortalUrl(abonnement.ls_customer_id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[billing/portal]', err);
    return apiError('Portal URL failed', 'BILLING_ERROR', 503);
  }
}
