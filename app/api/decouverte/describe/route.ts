import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { generateTitreDescription } from '@/lib/services/anthropic';
import { z } from 'zod';

const schema = z.object({
  titre:   z.string().min(1).max(300),
  artiste: z.string().min(1).max(300),
  annee:   z.number().int().min(1900).max(2030).nullable().optional(),
});

/**
 * POST /api/decouverte/describe
 * Generates a description + recommended phase for a single track.
 * Used client-side to show a preview before the user confirms adding the track.
 */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('Invalid data', 'VALIDATION_ERROR', 400);

  const { titre, artiste, annee } = parsed.data;

  // Fetch profile for context (langue + passions + bump years)
  const admin = createAdminClient();
  const { data: profil } = await admin
    .from('profils')
    .select('pays_jeunesse, passions, bump_annee_debut, bump_annee_fin, langue')
    .eq('user_id', userId)
    .single();

  const langue = (profil as { langue?: string } | null)?.langue ?? 'fr';

  try {
    const result = await generateTitreDescription(
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
    return NextResponse.json(result);
  } catch (err) {
    console.error('[decouverte/describe] error:', err);
    return NextResponse.json({ description: '', phase_recommandee: 'apres-midi' });
  }
}
