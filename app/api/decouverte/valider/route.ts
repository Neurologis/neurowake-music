import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  titre_id: z.string().uuid(),
  // 'propose' is accepted so the client can deselect (reset) a previous choice
  statut: z.enum(['propose', 'valide', 'refuse', 'incertain']),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid body', 'VALIDATION_ERROR', 400);
  }

  const supabase = createServerClient();
  const { error: dbError } = await supabase
    .from('titres_recommandes')
    .update({ statut: parsed.data.statut })
    .eq('id', parsed.data.titre_id)
    .eq('user_id', userId);

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  return NextResponse.json({ success: true });
}
