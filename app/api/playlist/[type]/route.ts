import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

const validTypes = ['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'favorite'];

export async function GET(
  req: NextRequest,
  { params }: { params: { type: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  if (!validTypes.includes(params.type)) {
    return apiError('Invalid playlist type', 'VALIDATION_ERROR', 400);
  }

  const supabase = createServerClient();
  let query = supabase
    .from('titres_audio')
    .select('*')
    .eq('user_id', userId)
    .order('ordre', { ascending: true });

  if (params.type === 'favorite') {
    query = query.eq('dans_playlist_favorite', true);
  }

  const { data: titres, error: dbError } = await query;
  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  const admin = createAdminClient();

  const titresAvecUrls = await Promise.all(
    (titres ?? []).map(async (t) => {
      const { data } = await admin.storage
        .from('audio-prive')
        .createSignedUrl(t.storage_path, 3600);
      return { ...t, audio_url: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ titres: titresAvecUrls });
}
