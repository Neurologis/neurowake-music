import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== process.env.ADMIN_EMAIL) return apiError('Forbidden', 'FORBIDDEN', 403);

  const admin = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: total }, { count: actifs }, { count: trials }, { count: sessions }] = await Promise.all([
    admin.from('abonnements').select('*', { count: 'exact', head: true }),
    admin.from('abonnements').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
    admin.from('abonnements').select('*', { count: 'exact', head: true }).eq('statut', 'trial'),
    admin.from('sessions_log').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
  ]);

  return NextResponse.json({ total, actifs, trials, sessions_7j: sessions });
}
