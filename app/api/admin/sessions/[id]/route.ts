import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  actif:           z.boolean().optional(),
  date_expiration: z.string().datetime().optional(),
  nb_ecoutes_max:  z.number().int().min(1).max(100).optional(),
  gamma_enabled:   z.boolean().optional(),
  messages_actifs: z.boolean().optional(),
}).partial();

async function isAdmin(supabase: ReturnType<typeof createServerClient>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === process.env.ADMIN_EMAIL;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('Corps invalide', 'VALIDATION_ERROR', 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error: dbError } = await admin
    .from('sessions_collectives')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (dbError) return apiError('Mise à jour échouée', 'DB_ERROR', 500);
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error: dbError } = await admin
    .from('sessions_collectives')
    .delete()
    .eq('id', params.id);

  if (dbError) return apiError('Suppression échouée', 'DB_ERROR', 500);
  return new NextResponse(null, { status: 204 });
}
