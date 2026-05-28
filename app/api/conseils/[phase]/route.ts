import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

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

  // Get user language
  const { data: profil } = await supabase
    .from('profils')
    .select('langue')
    .eq('user_id', userId)
    .single();

  const langue = profil?.langue ?? 'fr';

  // Get already seen conseils
  const { data: vus } = await supabase
    .from('conseils_affichages')
    .select('conseil_id')
    .eq('user_id', userId);

  const vusIds = (vus ?? []).map((v) => v.conseil_id);

  // Get unseen conseil
  type Phase = 'matin' | 'soins' | 'repas' | 'apres-midi' | 'coucher';
  type Langue = 'fr' | 'es' | 'en';

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

  // If all seen, reset rotation
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

  if (!conseil || conseil.length === 0) {
    return NextResponse.json({ conseil: null });
  }

  // Mark as seen
  await supabase.from('conseils_affichages').insert({
    user_id: userId,
    conseil_id: conseil[0].id,
  });

  return NextResponse.json({ conseil: conseil[0].texte });
}
