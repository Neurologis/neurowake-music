import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const updateSchema = z.object({ nom: z.string().min(1).max(60) });

/** PATCH /api/playlists/[id] — rename */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('playlists')
    .update({ nom: parsed.data.nom, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ playlist: data });
}

/** DELETE /api/playlists/[id] — delete playlist (cascade removes playlist_titres) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { error: dbError } = await supabase
    .from('playlists')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ success: true });
}
