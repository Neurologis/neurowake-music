import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const q = req.nextUrl.searchParams.get('q');
  const supabase = createServerClient();

  let query = supabase
    .from('titres_audio')
    .select('id, titre, artiste, annee, duree_secondes, repetitions, boucle_infinie, note_aidant, ordre, dans_playlist_favorite, created_at')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (q) {
    query = query.or(`titre.ilike.%${q}%,artiste.ilike.%${q}%`);
  }

  const { data, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  return NextResponse.json({ titres: data ?? [] });
}
