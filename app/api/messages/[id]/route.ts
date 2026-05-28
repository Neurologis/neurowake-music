import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  titre: z.string().max(100).optional(),
  texte_source: z.string().max(500).optional(),
  phase: z.enum(['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'toutes']).optional(),
  mode_diffusion: z.enum(['ouverture', 'cloture', 'rotation']).optional(),
  ordre: z.number().int().optional(),
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
    .from('messages_vocaux')
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
  const { data: msg } = await supabase
    .from('messages_vocaux')
    .select('audio_storage_path')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!msg) return apiError('Message not found', 'NOT_FOUND', 404);

  await supabase.from('messages_vocaux').delete().eq('id', params.id).eq('user_id', userId);

  if (msg.audio_storage_path) {
    const admin = createAdminClient();
    await admin.storage.from('audio-prive').remove([msg.audio_storage_path]);
  }

  return NextResponse.json({ success: true });
}
