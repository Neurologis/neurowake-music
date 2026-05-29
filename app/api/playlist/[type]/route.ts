import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

const validTypes = ['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'favorite'];

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

  if (params.type === 'favorite') {
    const { data, error: dbErr } = await supabase
      .from('titres_audio')
      .select('id, titre, artiste, annee, repetitions, boucle_infinie, ordre, storage_path')
      .eq('user_id', userId)
      .eq('dans_playlist_favorite', true)
      .order('ordre', { ascending: true });
    if (dbErr) return apiError('DB error', 'DB_ERROR', 500);
    return NextResponse.json({ titres: (data ?? []).map(t => ({ ...t, audio_url: null })) });
  }

  // For phase playlists: fetch all audio titles + phase assignments from recommandes
  const [audioRes, recommandesRes] = await Promise.all([
    supabase
      .from('titres_audio')
      .select('id, titre, artiste, annee, repetitions, boucle_infinie, ordre, storage_path')
      .eq('user_id', userId)
      .order('ordre', { ascending: true }),
    supabase
      .from('titres_recommandes')
      .select('titre, artiste, phase_recommandee')
      .eq('user_id', userId)
      .not('phase_recommandee', 'is', null),
  ]);

  if (audioRes.error) return apiError('DB error', 'DB_ERROR', 500);

  // Build a map: normalized "titre|artiste" → phase_recommandee
  const phaseMap = new Map<string, string>();
  for (const r of recommandesRes.data ?? []) {
    if (!r.phase_recommandee) continue;
    const key = `${r.titre.toLowerCase().trim()}|${r.artiste.toLowerCase().trim()}`;
    if (!phaseMap.has(key)) phaseMap.set(key, r.phase_recommandee);
  }

  // Filter: include if phase matches OR if no phase info (include in all phases as fallback)
  const filtered = (audioRes.data ?? []).filter(t => {
    const key = `${t.titre.toLowerCase().trim()}|${t.artiste.toLowerCase().trim()}`;
    const phase = phaseMap.get(key);
    return !phase || phase === params.type;
  });

  return NextResponse.json({ titres: filtered.map(t => ({ ...t, audio_url: null })) });
}
