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
    .select('id, titre, texte_source, phase, mode_diffusion, actif, auto_genere, ordre, created_at, audio_storage_path, duree_secondes')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (phase) {
    query = query.eq('phase', phase);
  }

  const { data, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  // Generate signed URLs for audio
  const admin = createAdminClient();
  const messagesAvecUrls = await Promise.all(
    (data ?? []).map(async (m) => {
      if (!m.audio_storage_path) return { ...m, audio_url: null };
      const { data: signed } = await admin.storage
        .from('audio-prive')
        .createSignedUrl(m.audio_storage_path, 3600);
      return { ...m, audio_url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ messages: messagesAvecUrls });
}
