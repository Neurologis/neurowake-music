import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

const validTypes = ['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'favorite'];

/**
 * GET /api/playlist/[type]
 * Returns track metadata for the requested playlist type.
 * `audio_url` is intentionally null — the client resolves local file URLs
 * from the local-audio-store before passing tracks to the player.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { type: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  if (!validTypes.includes(params.type)) {
    return apiError('Invalid playlist type', 'VALIDATION_ERROR', 400);
  }

  const supabase = createServerClient();
  let query = supabase
    .from('titres_audio')
    .select('id, titre, artiste, annee, repetitions, boucle_infinie, ordre, storage_path')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (params.type === 'favorite') {
    query = query.eq('dans_playlist_favorite', true);
  }

  const { data: titres, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  // audio_url is null — the client resolves it from the local file store.
  const titresWithNullUrl = (titres ?? []).map((t) => ({
    ...t,
    audio_url: null as null,
  }));

  return NextResponse.json({ titres: titresWithNullUrl });
}
