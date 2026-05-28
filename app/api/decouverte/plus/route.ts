import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { generateMusicDiscovery } from '@/lib/services/anthropic';

/**
 * POST /api/decouverte/plus
 * Generates 15 more discovery titles the user hasn't seen yet,
 * inserts them into titres_recommandes, and returns them.
 */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const admin = createAdminClient();

  // Fetch user profile
  const { data: profil } = await supabase
    .from('profils')
    .select('annee_naissance, bump_annee_debut, bump_annee_fin, genres_preferes, passions, pays_jeunesse, chanson_madeleine')
    .eq('user_id', userId)
    .single();

  if (!profil) return apiError('Profile not found', 'NOT_FOUND', 404);

  // Build exclusion list from already-generated titles
  const { data: existingTitres } = await admin
    .from('titres_recommandes')
    .select('artiste, titre')
    .eq('user_id', userId);

  const excludeList = (existingTitres ?? []).map((t) => `${t.artiste} — ${t.titre}`);

  // Generate 15 new unique titles
  const newTitres = await generateMusicDiscovery({
    annee_naissance: profil.annee_naissance,
    bump_annee_debut: profil.bump_annee_debut,
    bump_annee_fin: profil.bump_annee_fin,
    genres_preferes: profil.genres_preferes ?? [],
    passions: profil.passions ?? [],
    pays_jeunesse: profil.pays_jeunesse,
    chanson_madeleine: profil.chanson_madeleine,
    exclude_artiste_titre: excludeList,
    limit: 15,
  });

  if (newTitres.length === 0) {
    return NextResponse.json({ titres: [] });
  }

  const inserts = newTitres.map((t) => ({
    user_id: userId,
    titre: t.titre,
    artiste: t.artiste,
    annee: t.annee,
    pochette_url: null as string | null,
    musicbrainz_id: null as string | null,
    phase_recommandee: t.phase_recommandee,
    statut: 'propose' as const,
  }));

  const { data: inserted, error: insertError } = await admin
    .from('titres_recommandes')
    .insert(inserts)
    .select();

  if (insertError) {
    console.error('[decouverte/plus] insert error:', insertError);
    return apiError('Failed to save new titles', 'DB_ERROR', 500);
  }

  return NextResponse.json({ titres: inserted ?? [] });
}
