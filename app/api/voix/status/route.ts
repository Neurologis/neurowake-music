import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data } = await supabase
    .from('voice_profiles')
    .select('clone_status, created_at')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    hasVoice: !!data,
    status: data?.clone_status ?? null,
  });
}
