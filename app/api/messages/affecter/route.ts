import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const postSchema = z.object({
  message_id:       z.string().uuid(),
  type_affectation: z.enum(['playlist_phase', 'titre_specifique']),
  position:         z.enum(['debut', 'fin']),
  phase:            z.string().optional().nullable(),
  titre_id:         z.string().uuid().optional().nullable(),
});

const deleteSchema = z.object({
  affectation_id: z.string().uuid(),
});

// Helper : accès à la table sans type strict (migration peut ne pas être reflétée dans les types TS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const affectationsTable = (client: ReturnType<typeof createAdminClient>) => (client as any).from('messages_affectations');

/** POST /api/messages/affecter — créer ou remplacer une affectation */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[messages/affecter] Validation error:', parsed.error.flatten());
    return apiError('Invalid data', 'VALIDATION_ERROR', 400);
  }

  const { message_id, type_affectation, position, phase, titre_id } = parsed.data;

  if (type_affectation === 'playlist_phase' && !phase) {
    return apiError('phase required for playlist_phase', 'VALIDATION_ERROR', 400);
  }
  if (type_affectation === 'titre_specifique' && !titre_id) {
    return apiError('titre_id required for titre_specifique', 'VALIDATION_ERROR', 400);
  }

  const admin = createAdminClient();
  console.log('[messages/affecter] userId:', userId, 'message_id:', message_id, 'type:', type_affectation, 'position:', position, 'phase:', phase, 'titre_id:', titre_id);

  // Vérifier que le message appartient à l'utilisateur
  const { data: msg, error: msgErr } = await admin
    .from('messages_vocaux')
    .select('id')
    .eq('id', message_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (msgErr) {
    console.error('[messages/affecter] message lookup error:', msgErr);
    return apiError('DB error checking message ownership', 'DB_ERROR', 500);
  }
  if (!msg) {
    console.warn('[messages/affecter] message not found for userId:', userId, 'message_id:', message_id);
    return apiError('Message not found', 'NOT_FOUND', 404);
  }

  const tbl = affectationsTable(admin);

  // ── Stratégie : DELETE existant + INSERT neuf ─────────────────────────────
  // Évite la complexité de onConflict avec des colonnes nullables.

  // 1. Supprimer l'affectation conflictuelle existante (si elle existe)
  let deleteQuery = tbl.delete().eq('user_id', userId).eq('position', position);

  if (type_affectation === 'playlist_phase') {
    deleteQuery = deleteQuery
      .eq('type_affectation', 'playlist_phase')
      .eq('phase', phase);
  } else {
    deleteQuery = deleteQuery
      .eq('type_affectation', 'titre_specifique')
      .eq('titre_id', titre_id);
  }

  const { error: delErr } = await deleteQuery;
  if (delErr) {
    // Non-fatal si la ligne n'existe pas — on loggue et on continue
    console.warn('[messages/affecter] delete existing (non-fatal):', delErr.code, delErr.message);
  }

  // 2. Insérer la nouvelle affectation
  const newRow = {
    user_id:          userId,
    message_id,
    type_affectation,
    position,
    phase:            phase   ?? null,
    titre_id:         titre_id ?? null,
  };

  console.log('[messages/affecter] inserting row:', newRow);

  const { data, error: insertErr } = await tbl
    .insert(newRow)
    .select()
    .single();

  if (insertErr) {
    console.error('[messages/affecter] insert error — code:', insertErr.code, '— message:', insertErr.message, '— details:', insertErr.details, '— hint:', insertErr.hint);
    // Retourner les détails de l'erreur pour faciliter le débogage
    return NextResponse.json(
      {
        error:   'Failed to save affectation',
        code:    'DB_ERROR',
        detail:  insertErr.message,
        hint:    insertErr.hint ?? null,
        pgcode:  insertErr.code,
      },
      { status: 500 }
    );
  }

  console.log('[messages/affecter] inserted OK, id:', data?.id);
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
  const { error: delErr } = await affectationsTable(admin)
    .delete()
    .eq('id', parsed.data.affectation_id)
    .eq('user_id', userId);

  if (delErr) {
    console.error('[messages/affecter] delete error:', delErr.code, delErr.message);
    return apiError('Failed to delete affectation', 'DB_ERROR', 500);
  }

  return NextResponse.json({ ok: true });
}
