import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
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
    phase_recommandee: null as 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher' | null,
    statut: 'valide' as const,
  };

  const { data: inserted, error: insertErr } = await admin
    .from('titres_recommandes')
    .insert(insert)
    .select()
    .single();

  if (insertErr) {
    console.error('[decouverte/ajouter] Insert error:', insertErr.code, insertErr.message);
    return apiError('Failed to add title', 'DB_ERROR', 500);
  }

  // Attach itunes_url to the response (not stored in DB, returned for UI use)
  return NextResponse.json({ titre: { ...inserted, itunes_url: itunes_url ?? null } });
}
