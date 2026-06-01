import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const phase = req.nextUrl.searchParams.get('phase');
  const supabase = createServerClient();

  let query = supabase
    .from('messages_vocaux')
    .select('id, titre, texte_source, phase, actif, auto_genere, ordre, created_at, audio_storage_path, duree_secondes')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (phase) {
    query = query.eq('phase', phase as 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | 'toutes');
  }

  const { data, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  // Charger les affectations séparément (table peut ne pas exister si migration pas encore exécutée)
  const admin = createAdminClient();
  const msgIds = (data ?? []).map(m => m.id);

  let affectationsByMsg: Record<string, Array<{ id: string; type_affectation: string; position: string; phase: string | null; titre_id: string | null }>> = {};
  if (msgIds.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: affs } = await (admin as any)
        .from('messages_affectations')
        .select('id, message_id, type_affectation, position, phase, titre_id')
        .eq('user_id', userId)
        .in('message_id', msgIds);

      if (affs) {
        for (const aff of affs) {
          if (!affectationsByMsg[aff.message_id]) affectationsByMsg[aff.message_id] = [];
          affectationsByMsg[aff.message_id].push({
            id: aff.id,
            type_affectation: aff.type_affectation,
            position: aff.position,
            phase: aff.phase,
            titre_id: aff.titre_id,
          });
        }
      }
    } catch {
      // Table non créée — retourner les messages sans affectations
    }
  }

  // Générer les signed URLs pour l'audio
  const messagesAvecUrls = await Promise.all(
    (data ?? []).map(async (m) => {
      const audioUrl = m.audio_storage_path
        ? (await admin.storage.from('audio-prive').createSignedUrl(m.audio_storage_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        ...m,
        audio_url: audioUrl,
        affectations: affectationsByMsg[m.id] ?? [],
      };
    })
  );

  return NextResponse.json({ messages: messagesAvecUrls });
}
