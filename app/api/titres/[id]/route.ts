import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  repetitions:           z.number().int().min(1).max(10).optional(),
  boucle_infinie:        z.boolean().optional(),
  note_aidant:           z.string().max(500).optional(),
  ordre:                 z.number().int().optional(),
  dans_playlist_favorite: z.boolean().optional(),
  titre:                 z.string().optional(),
  artiste:               z.string().optional(),
  annee:                 z.number().int().min(1900).max(2030).optional().nullable(),
  // `storage_path` is updated when the user renames the associated file
  storage_path:          z.string().max(500).optional(),
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

  // Verify the titre belongs to this user before deleting
  const { data: titre } = await supabase
    .from('titres_audio')
    .select('id')
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

  // NOTE: no Supabase Storage deletion — files live on the user's device.
  // The client is responsible for calling removeAssociation() from local-audio-store.

  return NextResponse.json({ success: true });
}
