import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: titre, error: dbError } = await supabase
    .from('titres_audio')
    .select('storage_path')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (dbError || !titre) return apiError('Track not found', 'NOT_FOUND', 404);

  const admin = createAdminClient();
  const { data, error: signError } = await admin.storage
    .from('audio-prive')
    .createSignedUrl(titre.storage_path, 3600);

  if (signError || !data) return apiError('Failed to generate URL', 'STORAGE_ERROR', 500);

  return NextResponse.json({ url: data.signedUrl });
}
