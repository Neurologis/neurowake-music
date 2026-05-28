import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const formData = await req.formData().catch(() => null);
  if (!formData) return apiError('Invalid form data', 'VALIDATION_ERROR', 400);

  const file = formData.get('file') as File | null;
  if (!file) return apiError('No file provided', 'VALIDATION_ERROR', 400);

  // Validate format
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/mp4', 'audio/x-m4a'];
  const allowedExtensions = ['.mp3', '.wav', '.flac', '.m4a'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

  if (!allowedExtensions.includes(ext) && !allowedTypes.includes(file.type)) {
    return apiError('Unsupported audio format', 'INVALID_FORMAT', 400);
  }

  // Size limit 50MB
  if (file.size > 50 * 1024 * 1024) {
    return apiError('File too large (max 50MB)', 'FILE_TOO_LARGE', 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const admin = createAdminClient();

  // Upload to Supabase Storage
  const { error: uploadError } = await admin.storage
    .from('audio-prive')
    .upload(storagePath, buffer, {
      contentType: file.type || 'audio/mpeg',
      upsert: false,
    });

  if (uploadError) {
    return apiError(`Upload failed: ${uploadError.message}`, 'UPLOAD_ERROR', 500);
  }

  // Extract basic metadata from form or filename
  const titre = (formData.get('titre') as string) || file.name.replace(/\.[^.]+$/, '');
  const artiste = (formData.get('artiste') as string) || 'Inconnu';
  const annee = formData.get('annee') ? parseInt(formData.get('annee') as string) : null;

  const supabase = createServerClient();

  // Get current max order
  const { data: maxOrdre } = await supabase
    .from('titres_audio')
    .select('ordre')
    .eq('user_id', userId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single();

  const { data: inserted, error: dbError } = await supabase
    .from('titres_audio')
    .insert({
      user_id: userId,
      titre,
      artiste,
      annee,
      storage_path: storagePath,
      format: ext.replace('.', ''),
      taille_octets: file.size,
      ordre: (maxOrdre?.ordre ?? 0) + 1,
      dans_playlist_favorite: true,
    })
    .select()
    .single();

  if (dbError) {
    // Cleanup orphan file
    await admin.storage.from('audio-prive').remove([storagePath]);
    return apiError('Failed to save track', 'DB_ERROR', 500);
  }

  return NextResponse.json(inserted, { status: 201 });
}
