import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const schema = z.object({
  phase: z.enum(['matin', 'soins', 'repas', 'apres-midi', 'coucher']),
  langue: z.enum(['fr', 'es', 'en']),
  texte: z.string().min(1).max(500),
  actif: z.boolean().default(true),
  ordre: z.number().int().default(0),
});

async function isAdmin(userId: string, supabase: ReturnType<typeof createServerClient>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === process.env.ADMIN_EMAIL;
}

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(userId, supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  const phase = req.nextUrl.searchParams.get('phase');
  const langue = req.nextUrl.searchParams.get('langue');

  let query = supabase.from('conseils').select('*').order('ordre', { ascending: true });
  if (phase) query = query.eq('phase', phase);
  if (langue) query = query.eq('langue', langue);

  const { data, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  return NextResponse.json({ conseils: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(userId, supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const { data, error: dbError } = await supabase
    // @ts-ignore
.from('conseils').insert(parsed.data).select().single();
  if (dbError) return apiError('Insert failed', 'DB_ERROR', 500);

  return NextResponse.json(data, { status: 201 });
}
