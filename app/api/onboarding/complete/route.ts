import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { generateMusicDiscovery, detectLangueFromPays } from '@/lib/services/anthropic';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/types';

// Helper: normalise a string array that the AI might return as a comma-separated string
function toStringArray(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(v)) return (v as unknown[]).map(String).filter(Boolean);
  return [];
}

const schema = z.object({
  profil: z.object({
    prenom_proche: z.string().optional(),
    // ANNEES selector in the frontend goes up to 2009 — raise the cap to match
    annee_naissance: z.number().int().min(1900).max(2010),
    ville_jeunesse: z.string().min(1),
    pays_jeunesse: z.string().default('France'),
    pays_residence: z.string().optional(),
    bump_annee_debut: z.number().int(),
    bump_annee_fin: z.number().int(),
    // AI may return a comma-separated string instead of an array
    genres_preferes: z.preprocess(toStringArray, z.array(z.string()).default([])),
    passions: z.preprocess(toStringArray, z.array(z.string()).default([])),
    chanson_madeleine: z.string().optional(),
    // AI is prompted with "doux/normal/fort" but schema expects "douce/normale/sensible"
    sensibilite_volume: z.preprocess((v) => {
      if (typeof v !== 'string') return 'normale';
      const m: Record<string, string> = {
        doux: 'douce', douce: 'douce', faible: 'douce', bas: 'douce',
        normal: 'normale', normale: 'normale', moyen: 'normale',
        fort: 'sensible', forte: 'sensible', sensible: 'sensible',
        'élevé': 'sensible', 'élevée': 'sensible', haut: 'sensible',
      };
      return m[v.toLowerCase().trim()] ?? 'normale';
    }, z.enum(['douce', 'normale', 'sensible']).default('normale')),
    // AI may return "oui"/"non" or a string instead of a boolean
    acouphenes: z.preprocess((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return ['oui', 'yes', 'true', '1'].includes(v.toLowerCase().trim());
      if (typeof v === 'number') return v !== 0;
      return false;
    }, z.boolean().default(false)),
    // langue is auto-detected server-side from pays_jeunesse if not specified by client
    langue: z.preprocess(
      (v) => (!v || typeof v !== 'string' ? undefined : v),
      z.enum(['fr', 'es', 'en']).optional()
    ),
    conversation_history: z.array(z.any()).default([]),
  }),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error('[onboarding/complete] Zod validation failed:', JSON.stringify(parsed.error.flatten(), null, 2));
    return apiError('Invalid profile data', 'VALIDATION_ERROR', 400);
  }

  const profil = parsed.data.profil;
  const supabase = createServerClient();
  const admin = createAdminClient();

  // Sauvegarder le profil
  // Auto-detect langue from pays if not explicitly provided by the client
  const langueDetectee: 'fr' | 'es' | 'en' =
    profil.langue ?? detectLangueFromPays(profil.pays_jeunesse ?? 'France');

  const paysResidence = profil.pays_residence ?? profil.pays_jeunesse ?? 'France';

  const upsertPayload = {
    user_id: userId,
    prenom_proche: profil.prenom_proche ?? null,
    annee_naissance: profil.annee_naissance as number,
    ville_jeunesse: profil.ville_jeunesse as string,
    pays_jeunesse: profil.pays_jeunesse ?? 'France',
    bump_annee_debut: profil.bump_annee_debut as number,
    bump_annee_fin: profil.bump_annee_fin as number,
    genres_preferes: profil.genres_preferes ?? [],
    passions: profil.passions ?? [],
    chanson_madeleine: profil.chanson_madeleine ?? null,
    sensibilite_volume: profil.sensibilite_volume ?? 'normale',
    acouphenes: profil.acouphenes ?? false,
    // Defaults for audio columns — user can change them later in /app/parametres
    gamma_gain: 0.04,
    gamma_mode: (profil.acouphenes ? 'am' : 'binaural') as 'binaural' | 'monaural' | 'am',
    routine_prioritaire: 'matin' as const,
    langue: langueDetectee,
    conversation_history: (profil.conversation_history ?? []) as Json,
    onboarding_complet: true,
    updated_at: new Date().toISOString(),
  };

  // Retry up to 3 times for FK violations (code 23503).
  // These happen when Supabase Auth hasn't fully propagated the new user
  // into auth.users yet right after email confirmation.
  // onConflict: 'user_id' ensures UPDATE (not INSERT) when the profile already exists,
  // fixing the "duplicate key violates unique constraint profils_user_id_key" error.
  let saveError: { code?: string; message: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await supabase
      .from('profils')
      .upsert(upsertPayload, { onConflict: 'user_id' });
    saveError = result.error as typeof saveError;
    if (!saveError) break;
    if (saveError.code !== '23503' || attempt === 3) break;
    console.warn(`[onboarding/complete] FK violation on attempt ${attempt}, retrying in 1 s…`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (saveError) {
    console.error('[onboarding/complete] DB upsert error:', saveError);
    return NextResponse.json(
      { error: 'Failed to save profile', code: 'DB_ERROR', detail: saveError.message },
      { status: 500 }
    );
  }

  // Créer l'abonnement trial uniquement si l'utilisateur n'en a pas déjà un
  // (ne pas écraser un abonnement actif lors d'un re-onboarding)
  const { data: existingAbo } = await admin
    .from('abonnements')
    .select('id, statut')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existingAbo) {
    await admin.from('abonnements').insert({
      user_id: userId,
      statut: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  // (if existingAbo exists, keep it unchanged — don't reset a paying subscription)

  // Générer les recommandations musicales via IA (Claude)
  let titresRecommandes: unknown[] = [];
  try {
    const titresIA = await generateMusicDiscovery({
      annee_naissance: profil.annee_naissance,
      bump_annee_debut: profil.bump_annee_debut,
      bump_annee_fin: profil.bump_annee_fin,
      genres_preferes: profil.genres_preferes,
      passions: profil.passions,
      pays_jeunesse: profil.pays_jeunesse,
      pays_residence: paysResidence !== profil.pays_jeunesse ? paysResidence : undefined,
      chanson_madeleine: profil.chanson_madeleine,
      limit: 50,
    });

    // Supprimer les anciennes propositions IA avant d'en insérer de nouvelles
    // (évite les doublons lors d'un re-onboarding, préserve les titres validés/importés)
    await admin
      .from('titres_recommandes')
      .delete()
      .eq('user_id', userId)
      .eq('statut', 'propose');

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

    if (inserts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { error: insertErr } = await admin.from('titres_recommandes').insert(inserts as any);

      if (insertErr?.code === '42703') {
        // Attempt 2 — description column missing: retry without it
        console.warn('[onboarding/complete] 42703 — retrying without description');
        const withoutDesc = inserts.map(({ description: _d, ...rest }) => rest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e2 } = await admin.from('titres_recommandes').insert(withoutDesc as any);
        insertErr = e2 ?? null;

        if (e2?.code === '42703') {
          // Attempt 3 — phase_recommandee also missing
          console.warn('[onboarding/complete] 42703 again — retrying without description + phase_recommandee');
          const withoutBoth = withoutDesc.map(({ phase_recommandee: _p, ...rest }: { phase_recommandee?: unknown; [k: string]: unknown }) => rest);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: e3 } = await admin.from('titres_recommandes').insert(withoutBoth as any);
          insertErr = e3 ?? null;
        }
      }

      if (insertErr) {
        console.error('[onboarding/complete] Insert error after all retries:', insertErr.code, insertErr.message);
      } else {
        titresRecommandes = inserts;
      }
    }
  } catch (err) {
    console.error('[onboarding/complete] AI discovery error:', err);
    // Non-fatal: l'onboarding est quand même terminé sans recommandations
  }

  return NextResponse.json({ success: true, titresRecommandes });
}
