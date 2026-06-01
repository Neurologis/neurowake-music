import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { generateTitreDescription } from '@/lib/services/anthropic';
import { z } from 'zod';

/**
 * POST /api/decouverte/ajouter
 *
 * Adds a single title (found via iTunes search or manually entered)
 * directly to the user's titres_recommandes with statut='valide'.
 *
 * This is separate from /api/decouverte/plus (AI generation) — this endpoint
 * handles titles the user explicitly chose themselves.
 */

const schema = z.object({
  titre: z.string().min(1).max(300),
  artiste: z.string().min(1).max(300),
  annee: z.number().int().min(1900).max(2030).nullable().optional(),
  pochette_url: z.string().url().nullable().optional(),
  itunes_url: z.string().url().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid title data', 'VALIDATION_ERROR', 400);
  }

  const { titre, artiste, annee, pochette_url, itunes_url } = parsed.data;
  const admin = createAdminClient();

  // Fetch profile for description context
  const { data: profil } = await admin
    .from('profils')
    .select('pays_jeunesse, passions, bump_annee_debut, bump_annee_fin, langue')
    .eq('user_id', userId)
    .single();

  const langue = (profil as { langue?: string } | null)?.langue ?? 'fr';

  // Generate description + phase via AI (best-effort — never blocks insertion on failure)
  let aiDescription: string | null = null;
  let aiPhase: 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | null = null;
  try {
    const ai = await generateTitreDescription(
      titre,
      artiste,
      annee ?? null,
      {
        pays_jeunesse:    profil?.pays_jeunesse,
        passions:         profil?.passions,
        bump_annee_debut: profil?.bump_annee_debut,
        bump_annee_fin:   profil?.bump_annee_fin,
      },
      langue
    );
    aiDescription = ai.description || null;
    const VALID_PHASES = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'] as const;
    aiPhase = VALID_PHASES.includes(ai.phase_recommandee as typeof VALID_PHASES[number])
      ? (ai.phase_recommandee as typeof aiPhase)
      : null;
  } catch (aiErr) {
    console.warn('[decouverte/ajouter] generateTitreDescription failed (non-blocking):', aiErr);
  }

  // Check for duplicates (same titre+artiste for this user)
  const { data: existing } = await admin
    .from('titres_recommandes')
    .select('id, statut')
    .eq('user_id', userId)
    .ilike('titre', titre)
    .ilike('artiste', artiste)
    .maybeSingle();

  if (existing) {
    // Already exists — just mark it as validated if it isn't already
    if (existing.statut !== 'valide' && existing.statut !== 'importe') {
      await admin
        .from('titres_recommandes')
        .update({ statut: 'valide' })
        .eq('id', existing.id);
    }
    // Return the existing row
    const { data: row } = await admin
      .from('titres_recommandes')
      .select('*')
      .eq('id', existing.id)
      .single();
    return NextResponse.json({ titre: row });
  }

  // Insert new title — user explicitly validated it
  const insert = {
    user_id: userId,
    titre,
    artiste,
    annee: annee ?? null,
    pochette_url: pochette_url ?? null,
    musicbrainz_id: null as string | null,
    phase_recommandee: aiPhase,
    description: aiDescription,
    statut: 'valide' as const,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: inserted, error: insertErr } = await admin.from('titres_recommandes').insert(insert as any).select().single();

  // 42703 = undefined_column — description or phase_recommandee column missing → retry without them
  if (insertErr?.code === '42703') {
    console.warn('[decouverte/ajouter] 42703 — retrying without description + phase_recommandee');
    const { description: _d, phase_recommandee: _p, ...insertCore } = insert;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: d2, error: e2 } = await admin.from('titres_recommandes').insert(insertCore as any).select().single();
    inserted  = d2;
    insertErr = e2;
  }

  if (insertErr) {
    console.error('[decouverte/ajouter] Insert error:', insertErr.code, insertErr.message);
    return apiError('Failed to add title', 'DB_ERROR', 500);
  }

  // Attach itunes_url to the response (not stored in DB, returned for UI use)
  return NextResponse.json({ titre: { ...inserted, itunes_url: itunes_url ?? null } });
}
