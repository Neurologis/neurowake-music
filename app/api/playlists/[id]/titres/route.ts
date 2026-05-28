import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const addSchema = z.object({ titre_id: z.string().uuid() });
const removeSchema = z.object({ titre_id: z.string().uuid() });

/** GET /api/playlists/[id]/titres — tracks with signed audio URLs */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const admin = createAdminClient();

  // Verify ownership
  const { data: playlist } = await supabase
    .from('playlists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!playlist) return apiError('Playlist not found', 'NOT_FOUND', 404);

  // Fetch junction rows ordered by ordre
  const { data: junctions, error: jErr } = await supabase
    .from('playlist_titres')
    .select('titre_id, ordre')
    .eq('playlist_id', params.id)
    .order('ordre', { ascending: true });

  if (jErr) return apiError('DB error', 'DB_ERROR', 500);
  if (!junctions || junctions.length === 0) return NextResponse.json({ titres: [] });

  const titreIds = junctions.map((j) => j.titre_id);

  // Fetch titres_audio rows
  const { data: audioTitres, error: aErr } = await admin
    .from('titres_audio')
    .select('*')
    .in('id', titreIds)
    .eq('user_id', userId);

  if (aErr) return apiError('DB error', 'DB_ERROR', 500);

  // Reorder to match playlist ordre and generate signed URLs
  const ordered = junctions
    .map((j) => audioTitres?.find((t) => t.id === j.titre_id))
    .filter(Boolean);

  const withUrls = await Promise.all(
    (ordered as NonNullable<typeof audioTitres>[0][]).map(async (t) => {
      const { data } = await admin.storage
        .from('audio-prive')
        .createSignedUrl(t.storage_path, 3600);
      return { ...t, audio_url: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ titres: withUrls });
}

/** POST /api/playlists/[id]/titres — add a track */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();

  // Verify ownership of playlist
  const { data: playlist } = await supabase
    .from('playlists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!playlist) return apiError('Playlist not found', 'NOT_FOUND', 404);

  // Verify ownership of track
  const { data: titre } = await supabase
    .from('titres_audio')
    .select('id')
    .eq('id', parsed.data.titre_id)
    .eq('user_id', userId)
    .single();

  if (!titre) return apiError('Track not found', 'NOT_FOUND', 404);

  // Compute next ordre value
  const { count } = await supabase
    .from('playlist_titres')
    .select('id', { count: 'exact', head: true })
    .eq('playlist_id', params.id);

  const { error: insErr } = await supabase
    .from('playlist_titres')
    .insert({ playlist_id: params.id, titre_id: parsed.data.titre_id, ordre: count ?? 0 });

  if (insErr) {
    // 23505 = unique violation (track already in playlist) — treat as success
    if (insErr.code === '23505') return NextResponse.json({ success: true });
    return apiError('DB error', 'DB_ERROR', 500);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

/** DELETE /api/playlists/[id]/titres — remove a track */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();

  // Verify ownership of playlist
  const { data: playlist } = await supabase
    .from('playlists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!playlist) return apiError('Playlist not found', 'NOT_FOUND', 404);

  const { error: delErr } = await supabase
    .from('playlist_titres')
    .delete()
    .eq('playlist_id', params.id)
    .eq('titre_id', parsed.data.titre_id);

  if (delErr) return apiError('DB error', 'DB_ERROR', 500);
  return NextResponse.json({ success: true });
}
