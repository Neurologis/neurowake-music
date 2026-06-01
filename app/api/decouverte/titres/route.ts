import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { generateItunesLink, generateAmazonLink } from '@/lib/services/music-metadata';
import { generateMusicDiscovery, type TitreDecouvert } from '@/lib/services/anthropic';

/** Wraps a promise with a timeout. Returns the promise's value or an empty array after `ms` ms. */
function withTimeout<T>(promise: Promise<T[]>, ms: number, label: string): Promise<T[]> {
  return Promise.race([
    promise,
    new Promise<T[]>((resolve) =>
      setTimeout(() => {
        console.warn(`[${label}] Timeout after ${ms}ms — returning empty array`);
        resolve([]);
      }, ms)
    ),
  ]);
}

/** Insert titres_recommandes, retrying without phase_recommandee if the column doesn't exist yet. */
async function safeInsertTitres(
  admin: ReturnType<typeof createAdminClient>,
  inserts: Array<{
    user_id: string;
    titre: string;
    artiste: string;
    annee: number;
    pochette_url: string | null;
    musicbrainz_id: string | null;
    phase_recommandee: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
    description?: string | null;
    statut: 'propose';
  }>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await admin
    .from('titres_recommandes')
    .insert(inserts as any)
    .select();

  if (error) {
    console.error('[decouverte/titres] Insert error:', error.code, error.message);

    if (error.code === '42703') {
      // phase_recommandee column doesn't exist yet — retry without it
      console.warn('[decouverte/titres] Column phase_recommandee missing, retrying without it. Run the SQL migration to enable phase badges.');
      const insertsWithoutPhase = inserts.map(({ phase_recommandee: _p, ...rest }) => rest);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: d2, error: e2 } = await admin
        .from('titres_recommandes')
        .insert(insertsWithoutPhase as any)
        .select();
      if (e2) console.error('[decouverte/titres] Retry insert error:', e2.code, e2.message);
      return d2 ?? null;
    }

    // For unique-constraint violations (user already has these titles), try to read existing rows
    if (error.code === '23505') {
      console.warn('[decouverte/titres] Unique constraint — rows already exist, reading them back...');
      const { data: existing } = await admin
        .from('titres_recommandes')
        .select('*')
        .eq('user_id', inserts[0]?.user_id)
        .order('created_at', { ascending: true });
      return existing ?? null;
    }

    return null;
  }

  return data ?? null;
}

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  // Log API key presence at request time (helps diagnose missing env vars in production)
  console.log('[decouverte/titres] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);

  // Use admin client for all reads — avoids silent RLS failures that return 0 rows
  // without an error when the RLS policy is missing or misconfigured.
  const admin = createAdminClient();

  // ── 1. Read existing titles from DB ────────────────────────────────────────
  const { data: titres, error: dbError } = await admin
    .from('titres_recommandes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (dbError) {
    console.error('[decouverte/titres] DB read error:', dbError.code, dbError.message);
    return apiError('DB error', 'DB_ERROR', 500);
  }

  let finalTitres = titres ?? [];
  console.log(`[decouverte/titres] Found ${finalTitres.length} existing titles for user ${userId.slice(0, 8)}…`);

  // ── 2. Auto-generate if empty ───────────────────────────────────────────────
  // Handles: (a) users who completed onboarding before AI discovery was added,
  //          (b) users whose onboarding insert failed (e.g., missing DB column).
  if (finalTitres.length === 0) {
    console.log('[decouverte/titres] No titles — fetching profile to auto-generate...');

    const { data: profil, error: profErr } = await admin
      .from('profils')
      .select('annee_naissance, bump_annee_debut, bump_annee_fin, genres_preferes, passions, pays_jeunesse, chanson_madeleine')
      .eq('user_id', userId)
      .single();

    if (profErr || !profil) {
      console.warn('[decouverte/titres] Profile not found or error:', profErr?.message ?? 'no profile row');
      console.warn('[decouverte/titres] user_id searched:', userId);
      return NextResponse.json({ titres: [] });
    }

    // Null-safe bump years — compute from birth year if columns are missing
    const bumpDebut = profil.bump_annee_debut ?? (profil.annee_naissance + 10);
    const bumpFin   = profil.bump_annee_fin   ?? (profil.annee_naissance + 25);

    console.log('[decouverte/titres] Profile found:', {
      annee_naissance: profil.annee_naissance,
      period: `${bumpDebut}–${bumpFin}`,
      pays: profil.pays_jeunesse,
      genres: profil.genres_preferes,
      passions: profil.passions,
      chanson_madeleine: profil.chanson_madeleine,
    });

    try {
      // Race AI generation against a 50-second timeout.
      // Claude on a cold start can take 40-55 s.
      // This ensures the HTTP response is always sent before the infrastructure
      // (Vercel / browser) kills the connection.
      const titresIA = await withTimeout<TitreDecouvert>(
        generateMusicDiscovery({
          annee_naissance: profil.annee_naissance,
          bump_annee_debut: bumpDebut,
          bump_annee_fin: bumpFin,
          genres_preferes: profil.genres_preferes ?? [],
          passions: profil.passions ?? [],
          pays_jeunesse: profil.pays_jeunesse ?? 'France',
          // pays_residence used only at onboarding time (column pending DB migration)
          chanson_madeleine: profil.chanson_madeleine,
          limit: 50,
        }),
        50_000,
        'decouverte/titres'
      );

      console.log(`[decouverte/titres] AI returned ${titresIA.length} titles`);

      if (titresIA.length > 0) {
        const inserts = titresIA.map((t) => ({
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

        const inserted = await safeInsertTitres(admin, inserts);
        if (inserted && inserted.length > 0) {
          finalTitres = inserted;
          console.log(`[decouverte/titres] Inserted ${inserted.length} titles into DB`);
        } else {
          // Insert failed — still serve the AI-generated titles so the user sees content.
          // Next page load will try DB again and re-generate if still empty.
          console.error('[decouverte/titres] Insert returned null or empty — serving AI titles in memory');
          finalTitres = titresIA.map((t) => ({
            id: `mem-${Math.random().toString(36).slice(2, 10)}`,
            user_id: userId,
            titre: t.titre,
            artiste: t.artiste,
            annee: t.annee,
            pochette_url: null,
            musicbrainz_id: null,
            phase_recommandee: t.phase_recommandee,
            description: t.description ?? null,
            statut: 'propose' as const,
            created_at: new Date().toISOString(),
          }));
        }
      } else {
        console.warn('[decouverte/titres] AI returned 0 titles — check profile data and Claude API key');
      }
    } catch (err) {
      console.error('[decouverte/titres] generateMusicDiscovery threw:', err);
    }
  }

  // ── 3. Add purchase links and return ───────────────────────────────────────
  const itunes_token = process.env.ITUNES_AFFILIATE_TOKEN;
  const amazon_tag = process.env.AMAZON_ASSOCIATE_TAG;

  const titresAvecLiens = finalTitres.map((t) => ({
    ...t,
    itunes_url: generateItunesLink(t.titre, t.artiste, itunes_token),
    amazon_url: generateAmazonLink(t.titre, t.artiste, amazon_tag),
  }));

  console.log(`[decouverte/titres] Returning ${titresAvecLiens.length} titles`);
  return NextResponse.json({ titres: titresAvecLiens });
}
