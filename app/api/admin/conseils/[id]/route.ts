import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const patchSchema = z.object({
  texte: z.string().min(1).max(500).optional(),
  actif: z.boolean().optional(),
  ordre: z.number().int().optional(),
});

async function isAdmin(supabase: ReturnType<typeof createServerClient>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === process.env.ADMIN_EMAIL;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const { data, error: dbError } = await supabase
   // @ts-ignore
.from('conseils').update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', params.id).select().single();
  if (dbError) return apiError('Update failed', 'DB_ERROR', 500);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  if (!await isAdmin(supabase)) return apiError('Forbidden', 'FORBIDDEN', 403);

  await supabase.from('conseils').delete().eq('id', params.id);
  return NextResponse.json({ success: true });
}
