import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createSchema = z.object({
  nom: z.string().min(1).max(60),
});

/** GET /api/playlists — list user's playlists */
export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('playlists')
    .select('id, nom, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ playlists: data ?? [] });
}

/** POST /api/playlists — create a new playlist */
export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  const { data, error: dbError } = await supabase
    .from('playlists')
    .insert({ user_id: userId, nom: parsed.data.nom })
    .select()
    .single();

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ playlist: data }, { status: 201 });
}
