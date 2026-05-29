import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const q = req.nextUrl.searchParams.get('q');
  const supabase = createServerClient();

  let query = supabase
    .from('titres_audio')
    .select('id, titre, artiste, annee, duree_secondes, repetitions, boucle_infinie, note_aidant, ordre, dans_playlist_favorite, storage_path, created_at')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (q) {
    query = query.or(`titre.ilike.%${q}%,artiste.ilike.%${q}%`);
  }

  const { data, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  return NextResponse.json({ titres: data ?? [] });
}

/**
 * POST /api/titres — create a titre from metadata only (no file upload).
 * The actual audio file stays on the user's device; only metadata is saved.
 * `filename` is stored in `storage_path` as a local hint for file re-association.
 */
const createSchema = z.object({
  titre:    z.string().min(1).max(200),
  artiste:  z.string().min(1).max(200).default('Inconnu'),
  annee:    z.number().int().min(1900).max(2030).optional().nullable(),
  filename: z.string().max(500).optional().default(''),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();

  // Get current max order to append at end
  const { data: maxRow } = await supabase
    .from('titres_audio')
    .select('ordre')
    .eq('user_id', userId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single();

  const { data: inserted, error: dbError } = await supabase
    .from('titres_audio')
    .insert({
      user_id:               userId,
      titre:                 parsed.data.titre,
      artiste:               parsed.data.artiste,
      annee:                 parsed.data.annee ?? null,
      storage_path:          parsed.data.filename || '',   // filename as local hint
      ordre:                 (maxRow?.ordre ?? 0) + 1,
      dans_playlist_favorite: true,
    })
    .select()
    .single();

  if (dbError) return apiError('Failed to save track', 'DB_ERROR', 500);

  return NextResponse.json(inserted, { status: 201 });
}
