import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const postSchema = z.object({
  message_id:        z.string().uuid(),
  type_affectation:  z.enum(['playlist_phase', 'titre_specifique']),
  position:          z.enum(['debut', 'fin']),
  phase:             z.string().optional().nullable(),
  titre_id:          z.string().uuid().optional().nullable(),
});

const deleteSchema = z.object({
  affectation_id: z.string().uuid(),
});

/** POST /api/messages/affecter — créer une affectation */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid data', 'VALIDATION_ERROR', 400);

  const { message_id, type_affectation, position, phase, titre_id } = parsed.data;

  if (type_affectation === 'playlist_phase' && !phase) {
    return apiError('phase required for playlist_phase', 'VALIDATION_ERROR', 400);
  }
  if (type_affectation === 'titre_specifique' && !titre_id) {
    return apiError('titre_id required for titre_specifique', 'VALIDATION_ERROR', 400);
  }

  const admin = createAdminClient();

  // Vérifier que le message appartient à l'utilisateur
  const { data: msg } = await admin
    .from('messages_vocaux')
    .select('id')
    .eq('id', message_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!msg) return apiError('Message not found', 'NOT_FOUND', 404);

  // Upsert — remplace l'affectation existante pour cette combinaison
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: insertErr } = await (admin as any)
    .from('messages_affectations')
    .upsert({
      user_id: userId,
      message_id,
      type_affectation,
      position,
      phase: phase ?? null,
      titre_id: titre_id ?? null,
    }, {
      onConflict: type_affectation === 'playlist_phase'
        ? 'user_id,phase,type_affectation,position'
        : 'user_id,titre_id,position',
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[messages/affecter] upsert error:', insertErr.code, insertErr.message);
    return apiError('Failed to save affectation', 'DB_ERROR', 500);
  }

  return NextResponse.json({ affectation: data });
}

/** DELETE /api/messages/affecter — supprimer une affectation */
export async function DELETE(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid data', 'VALIDATION_ERROR', 400);

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (admin as any)
    .from('messages_affectations')
    .delete()
    .eq('id', parsed.data.affectation_id)
    .eq('user_id', userId);

  if (delErr) return apiError('Failed to delete affectation', 'DB_ERROR', 500);
  return NextResponse.json({ ok: true });
}
