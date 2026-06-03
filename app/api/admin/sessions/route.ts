import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createSchema = z.object({
  nom:             z.string().min(1).max(100),
  description:     z.string().max(500).optional(),
  playlist_url:    z.string().min(1).max(200),
  date_expiration: z.string().datetime(),
  nb_ecoutes_max:  z.number().int().min(1).max(100).default(3),
  gamma_enabled:   z.boolean().default(true),
  messages_actifs: z.boolean().default(false),
});

async function isAdmin(supabase: ReturnType<typeof createServerClient>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === process.env.ADMIN_EMAIL;
}

/** Generate a random access code: XXXX-XXXX-XXXX (uppercase alphanumeric, no 0/O/1/I) */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${segment()}-${segment()}-${segment()}`;
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error: dbError } = await admin
    .from('sessions_collectives')
    .select('*, sessions_acces(count)')
    .order('created_at', { ascending: false });

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError('Corps invalide', 'VALIDATION_ERROR', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Generate a unique code (retry up to 5 times on collision)
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await admin
      .from('sessions_collectives')
      .select('id')
      .eq('code_acces', code)
      .single();
    if (!existing) break;
    code = generateCode();
  }

  const { data, error: dbError } = await admin
    .from('sessions_collectives')
    .insert({
      nom:             parsed.data.nom,
      description:     parsed.data.description ?? null,
      code_acces:      code,
      playlist_url:    parsed.data.playlist_url,
      date_expiration: parsed.data.date_expiration,
      nb_ecoutes_max:  parsed.data.nb_ecoutes_max,
      gamma_enabled:   parsed.data.gamma_enabled,
      messages_actifs: parsed.data.messages_actifs,
      actif:           true,
    })
    .select()
    .single();

  if (dbError) return apiError('Création échouée', 'DB_ERROR', 500);
  return NextResponse.json(data, { status: 201 });
}
