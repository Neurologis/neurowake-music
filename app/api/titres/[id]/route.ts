import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  repetitions: z.number().int().min(1).max(10).optional(),
  boucle_infinie: z.boolean().optional(),
  note_aidant: z.string().max(500).optional(),
  ordre: z.number().int().optional(),
  dans_playlist_favorite: z.boolean().optional(),
  titre: z.string().optional(),
  artiste: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('titres_audio')
    .update(parsed.data)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) return apiError('Update failed', 'DB_ERROR', 500);
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();

  // Get storage path before delete
  const { data: titre } = await supabase
    .from('titres_audio')
    .select('storage_path')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!titre) return apiError('Track not found', 'NOT_FOUND', 404);

  const { error: dbError } = await supabase
    .from('titres_audio')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (dbError) return apiError('Delete failed', 'DB_ERROR', 500);

  // Delete from storage
  const admin = createAdminClient();
  await admin.storage.from('audio-prive').remove([titre.storage_path]);

  return NextResponse.json({ success: true });
}
