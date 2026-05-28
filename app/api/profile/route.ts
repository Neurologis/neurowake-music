import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  langue: z.enum(['fr', 'es', 'en']).optional(),
  sensibilite_volume: z.enum(['douce', 'normale', 'sensible']).optional(),
  acouphenes: z.boolean().optional(),
  gamma_gain: z.number().min(0).max(0.1).optional(),
  gamma_mode: z.enum(['binaural', 'monaural', 'am']).optional(),
  routine_prioritaire: z.enum(['matin', 'soins', 'repas', 'apres-midi', 'coucher']).optional(),
  onboarding_complet: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('profils')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (dbError) return NextResponse.json({ profil: null });
  return NextResponse.json({ profil: data });
}

export async function PATCH(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('profils')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) return apiError('Update failed', 'DB_ERROR', 500);
  return NextResponse.json({ profil: data });
}
