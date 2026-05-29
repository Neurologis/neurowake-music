import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

const validTypes = ['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'favorite'];

const SELECT_COLS = 'id, titre, artiste, annee, repetitions, boucle_infinie, ordre, storage_path';

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

  // ── Favoris ────────────────────────────────────────────────────────────────
  if (params.type === 'favorite') {
    const { data, error: dbErr } = await supabase
      .from('titres_audio')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('dans_playlist_favorite', true)
      .order('ordre', { ascending: true });
    if (dbErr) return apiError('DB error', 'DB_ERROR', 500);
    return NextResponse.json({ titres: (data ?? []).map(t => ({ ...t, audio_url: null })) });
  }

  // ── Playlists par phase ────────────────────────────────────────────────────
  // Strategy A: query titres_audio.phase_recommandee directly (column added in migration 001)
  //   → phase IS NULL (no assignment → appears in all phases)
  //   → OR phase = params.type
  const { data, error: dbErr } = await supabase
    .from('titres_audio')
    .select(SELECT_COLS)
    .eq('user_id', userId)
    .or(`phase_recommandee.is.null,phase_recommandee.eq.${params.type}`)
    .order('ordre', { ascending: true });

  if (!dbErr) {
    return NextResponse.json({ titres: (data ?? []).map(t => ({ ...t, audio_url: null })) });
  }

  // Strategy B: column doesn't exist yet (migration not applied) → fall back to
  // joining titres_recommandes by titre+artiste name
  if (dbErr.code === '42703') {
    const [audioRes, recommandesRes] = await Promise.all([
      supabase
        .from('titres_audio')
        .select(SELECT_COLS)
        .eq('user_id', userId)
        .order('ordre', { ascending: true }),
      supabase
        .from('titres_recommandes')
        .select('titre, artiste, phase_recommandee')
        .eq('user_id', userId)
        .not('phase_recommandee', 'is', null),
    ]);

    if (audioRes.error) return apiError('DB error', 'DB_ERROR', 500);

    // Build phase map — if titres_recommandes also lacks the column, map is empty
    // and all titles are included (graceful fallback)
    const phaseMap = new Map<string, string>();
    for (const r of recommandesRes.data ?? []) {
      if (!r.phase_recommandee) continue;
      const key = `${r.titre.toLowerCase().trim()}|${r.artiste.toLowerCase().trim()}`;
      if (!phaseMap.has(key)) phaseMap.set(key, r.phase_recommandee);
    }

    const filtered = (audioRes.data ?? []).filter(t => {
      const key   = `${t.titre.toLowerCase().trim()}|${t.artiste.toLowerCase().trim()}`;
      const phase = phaseMap.get(key);
      return !phase || phase === params.type;
    });

    return NextResponse.json({ titres: filtered.map(t => ({ ...t, audio_url: null })) });
  }

  // Any other DB error
  return apiError('DB error', 'DB_ERROR', 500);
}
