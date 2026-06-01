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

  // Generate 20 new unique titles (up to 100 total with multiple calls)
  const newTitres = await generateMusicDiscovery({
    annee_naissance: profil.annee_naissance,
    bump_annee_debut: profil.bump_annee_debut,
    bump_annee_fin: profil.bump_annee_fin,
    genres_preferes: profil.genres_preferes ?? [],
    passions: profil.passions ?? [],
    pays_jeunesse: profil.pays_jeunesse,
    // pays_residence pending DB migration — uses pays_jeunesse as cultural baseline
    chanson_madeleine: profil.chanson_madeleine,
    exclude_artiste_titre: excludeList,
    limit: 20,
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
    description: t.description ?? null,
    statut: 'propose' as const,
  }));

  // Attempt 1 — full insert (description + phase_recommandee)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: inserted, error: insertError } = await admin.from('titres_recommandes').insert(inserts as any).select();

  if (insertError) {
    console.error('[decouverte/plus] insert error:', insertError.code, insertError.message);

    if (insertError.code === '42703') {
      // Attempt 2 — without description
      console.warn('[decouverte/plus] 42703 — retrying without description');
      const withoutDesc = inserts.map(({ description: _d, ...rest }) => rest);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: d2, error: e2 } = await admin.from('titres_recommandes').insert(withoutDesc as any).select();

      if (e2 && e2.code === '42703') {
        // Attempt 3 — without description AND phase_recommandee
        console.warn('[decouverte/plus] 42703 again — retrying without description + phase_recommandee');
        const withoutBoth = withoutDesc.map(({ phase_recommandee: _p, ...rest }: { phase_recommandee?: unknown; [k: string]: unknown }) => rest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: d3, error: e3 } = await admin.from('titres_recommandes').insert(withoutBoth as any).select();
        if (e3) { console.error('[decouverte/plus] retry-3 error:', e3.code, e3.message); return apiError('Failed to save new titles', 'DB_ERROR', 500); }
        inserted = d3;
      } else if (e2) {
        console.error('[decouverte/plus] retry-2 error:', e2.code, e2.message);
        return apiError('Failed to save new titles', 'DB_ERROR', 500);
      } else {
        inserted = d2;
      }
    } else {
      return apiError('Failed to save new titles', 'DB_ERROR', 500);
    }
  }

  return NextResponse.json({ titres: inserted ?? [] });
}
