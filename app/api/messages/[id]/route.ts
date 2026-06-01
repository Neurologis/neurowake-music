import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { generateSpeech } from '@/lib/services/elevenlabs';
import { getCachedAudio, cacheAudio } from '@/lib/cache';
import { z } from 'zod';

const patchSchema = z.object({
  titre:            z.string().max(100).optional(),
  texte_source:     z.string().max(500).optional(),
  phase:            z.enum(['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'toutes']).optional(),
  ordre:            z.number().int().optional(),
  regenerate_audio: z.boolean().optional().default(false),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const { regenerate_audio, ...fields } = parsed.data;

  const supabase = createServerClient();
  const admin    = createAdminClient();

  // Régénération audio si demandée + texte_source fourni
  let newStoragePath: string | undefined;
  if (regenerate_audio && fields.texte_source) {
    const { data: voiceProfile } = await supabase
      .from('voice_profiles')
      .select('elevenlabs_voice_id, clone_status')
      .eq('user_id', userId)
      .single();

    if (!voiceProfile || voiceProfile.clone_status !== 'ready') {
      return apiError('Voice not ready', 'VOICE_NOT_READY', 400);
    }

    const { data: profil } = await supabase
      .from('profils').select('langue').eq('user_id', userId).single();

    const langue  = profil?.langue ?? 'fr';
    const voiceId = voiceProfile.elevenlabs_voice_id;

    let audioUrl = await getCachedAudio(fields.texte_source, voiceId, userId, langue);
    if (!audioUrl) {
      const audioBuffer = await generateSpeech(fields.texte_source, voiceId, langue);
      audioUrl = await cacheAudio(fields.texte_source, voiceId, userId, langue, audioBuffer);
    }

    const urlObj   = new URL(audioUrl);
    const pathParts = urlObj.pathname.split('/object/sign/audio-prive/');
    newStoragePath  = pathParts[1]?.split('?')[0] ?? '';
  }

  // Construction du payload (sans regenerate_audio)
  const updatePayload: Record<string, unknown> = { ...fields };
  if (newStoragePath) updatePayload.audio_storage_path = newStoragePath;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbError } = await supabase
    .from('messages_vocaux')
    .update(updatePayload as any)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) return apiError('Update failed', 'DB_ERROR', 500);

  // Générer une URL signée fraîche si l'audio a changé
  if (newStoragePath) {
    const { data: signed } = await admin.storage
      .from('audio-prive')
      .createSignedUrl(newStoragePath, 3600);
    return NextResponse.json({ ...data, audio_url: signed?.signedUrl ?? null });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: msg } = await supabase
    .from('messages_vocaux')
    .select('audio_storage_path')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!msg) return apiError('Message not found', 'NOT_FOUND', 404);

  await supabase.from('messages_vocaux').delete().eq('id', params.id).eq('user_id', userId);

  if (msg.audio_storage_path) {
    const admin = createAdminClient();
    await admin.storage.from('audio-prive').remove([msg.audio_storage_path]);
  }

  return NextResponse.json({ success: true });
}
