import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { searchTracksByPeriod } from '@/lib/services/musicbrainz';
import { filterMusicBrainzResults } from '@/lib/services/anthropic';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/types';

const schema = z.object({
  profil: z.object({
    prenom_proche: z.string().optional(),
    annee_naissance: z.number().int().min(1900).max(2000),
    ville_jeunesse: z.string().min(1),
    pays_jeunesse: z.string().default('France'),
    bump_annee_debut: z.number().int(),
    bump_annee_fin: z.number().int(),
    genres_preferes: z.array(z.string()).default([]),
    passions: z.array(z.string()).default([]),
    chanson_madeleine: z.string().optional(),
    sensibilite_volume: z.enum(['douce', 'normale', 'sensible']).default('normale'),
    acouphenes: z.boolean().default(false),
    langue: z.enum(['fr', 'es', 'en']).default('fr'),
    conversation_history: z.array(z.any()).default([]),
  }),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid profile data', 'VALIDATION_ERROR', 400);
  }

  const profil = parsed.data.profil;
  const supabase = createServerClient();
  const admin = createAdminClient();

  // Sauvegarder le profil
  const { error: saveError } = await supabase.from('profils').upsert({
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
    langue: profil.langue ?? 'fr',
    conversation_history: (profil.conversation_history ?? []) as Json,
    onboarding_complet: true,
    updated_at: new Date().toISOString(),
  });

  if (saveError) {
    return apiError('Failed to save profile', 'DB_ERROR', 500);
  }

  // Créer l'abonnement trial
  await admin.from('abonnements').upsert({
    user_id: userId,
    statut: 'trial',
    trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Rechercher des titres MusicBrainz
  let titresRecommandes: unknown[] = [];
  try {
    const titresBruts = await searchTracksByPeriod({
      annee_debut: profil.bump_annee_debut,
      annee_fin: profil.bump_annee_fin,
      pays: profil.pays_jeunesse,
      genres: profil.genres_preferes,
      limit: 50,
    });

    const titresFiltres = await filterMusicBrainzResults(
      titresBruts,
      profil,
      profil.langue
    );

    // Sauvegarder les recommandations
    interface TitreCandidat {
      titre?: string;
      artiste?: string;
      annee?: number | null;
      pochette_url?: string | null;
      musicbrainz_id?: string | null;
    }
    const inserts = titresFiltres.slice(0, 20).map((t: object) => {
      const track = t as TitreCandidat;
      return {
        user_id: userId,
        titre: track.titre ?? '',
        artiste: track.artiste ?? '',
        annee: track.annee ?? null,
        pochette_url: track.pochette_url ?? null,
        musicbrainz_id: track.musicbrainz_id ?? null,
        statut: 'propose' as const,
      };
    });

    await admin.from('titres_recommandes').insert(inserts);
    titresRecommandes = inserts;
  } catch (err) {
    console.error('[onboarding/complete] MusicBrainz error:', err);
    // Non-fatal: l'onboarding est quand même terminé
  }

  return NextResponse.json({ success: true, titresRecommandes });
}
