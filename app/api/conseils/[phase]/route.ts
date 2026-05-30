import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { generatePersonalizedAdvice } from '@/lib/services/anthropic';

const validPhases = ['matin', 'soins', 'repas', 'apres-midi', 'coucher'];

export async function GET(
  req: NextRequest,
  { params }: { params: { phase: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  if (!validPhases.includes(params.phase)) {
    return apiError('Invalid phase', 'VALIDATION_ERROR', 400);
  }

  const supabase = createServerClient();

  // Langue et profil utilisateur
  const { data: profil } = await supabase
    .from('profils')
    .select('langue, genres_preferes, passions, bump_annee_debut, bump_annee_fin')
    .eq('user_id', userId)
    .single();

  const langue = profil?.langue ?? 'fr';

  // Conseils déjà vus
  const { data: vus } = await supabase
    .from('conseils_affichages')
    .select('conseil_id')
    .eq('user_id', userId);

  const vusIds = (vus ?? []).map((v) => v.conseil_id);

  type Phase = 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
  type Langue = 'fr' | 'es' | 'en';

  // Cherche un conseil non vu en base
  let query = supabase
    .from('conseils')
    .select('id, texte')
    .eq('phase', params.phase as Phase)
    .eq('langue', langue as Langue)
    .eq('actif', true)
    .order('ordre', { ascending: true })
    .limit(1);

  if (vusIds.length > 0) {
    query = query.not('id', 'in', `(${vusIds.join(',')})`);
  }

  let { data: conseil } = await query;

  // Reset rotation si tous vus
  if (!conseil || conseil.length === 0) {
    await supabase
      .from('conseils_affichages')
      .delete()
      .eq('user_id', userId);

    const { data: reset } = await supabase
      .from('conseils')
      .select('id, texte')
      .eq('phase', params.phase as Phase)
      .eq('langue', langue as Langue)
      .eq('actif', true)
      .order('ordre', { ascending: true })
      .limit(1);

    conseil = reset;
  }

  // Conseil trouvé en base → marquer vu et retourner
  if (conseil && conseil.length > 0) {
    await supabase.from('conseils_affichages').insert({
      user_id: userId,
      conseil_id: conseil[0].id,
    });
    return NextResponse.json({ conseil: conseil[0].texte });
  }

  // Aucun conseil en base → générer avec l'IA
  try {
    const texte = await generatePersonalizedAdvice(
      profil ?? {},
      params.phase,
      langue
    );
    return NextResponse.json({ conseil: texte });
  } catch {
    return NextResponse.json({ conseil: null });
  }
}