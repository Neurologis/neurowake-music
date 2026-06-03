import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/auth';
import { z } from 'zod';

const schema = z.object({
  code_acces: z.string().min(1).max(50).trim(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('Code requis', 'VALIDATION_ERROR', 400);

  // Identify user if logged in (optional at this step — session joining works without account)
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Look up the session by code (case-insensitive)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: session, error: sessionError } = await admin
    .from('sessions_collectives')
    .select('*')
    .eq('code_acces', parsed.data.code_acces.toUpperCase())
    .eq('actif', true)
    .single();

  if (sessionError || !session) {
    return apiError('Code invalide ou expiré', 'INVALID_CODE', 404);
  }

  // Check expiration
  if (new Date(session.date_expiration) < new Date()) {
    return apiError('Code invalide ou expiré', 'EXPIRED', 403);
  }

  // If user is authenticated, check/update nb_ecoutes
  if (user) {
    const { data: acces } = await admin
      .from('sessions_acces')
      .select('*')
      .eq('session_id', session.id)
      .eq('user_id', user.id)
      .single();

    const nbEcoutes = acces?.nb_ecoutes ?? 0;

    if (session.nb_ecoutes_max !== null && nbEcoutes >= session.nb_ecoutes_max) {
      return apiError("Nombre d'écoutes maximum atteint", 'MAX_REACHED', 403);
    }

    const now = new Date().toISOString();
    if (acces) {
      await admin
        .from('sessions_acces')
        .update({
          nb_ecoutes:      nbEcoutes + 1,
          derniere_ecoute: now,
        })
        .eq('id', acces.id);
    } else {
      await admin
        .from('sessions_acces')
        .insert({
          session_id:      session.id,
          user_id:         user.id,
          nb_ecoutes:      1,
          premiere_ecoute: now,
          derniere_ecoute: now,
        });
    }
  }

  return NextResponse.json({ session });
}
