import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  playlist_type: z.string(),
  duree_secondes: z.number().int().min(0),
  gamma_actif: z.boolean().default(true),
  gamma_mode: z.string().optional(),
  message_joue: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  await supabase.from('sessions_log').insert({ user_id: userId, ...parsed.data });

  return NextResponse.json({ success: true });
}
