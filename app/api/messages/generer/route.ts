import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithRateLimit, apiError } from '@/lib/auth';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { generateSpeech } from '@/lib/services/elevenlabs';
import { getCachedAudio, cacheAudio } from '@/lib/cache';
import { z } from 'zod';

const schema = z.object({
  titre: z.string().min(1).max(100),
  texte: z.string().min(1).max(500),
  phase: z.enum(['matin', 'soins', 'repas', 'apres-midi', 'coucher', 'toutes']),
  mode_diffusion: z.enum(['ouverture', 'cloture', 'rotation']).default('ouverture'),
});

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuthWithRateLimit(req, 5);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError('Invalid body', 'VALIDATION_ERROR', 400);

  const supabase = createServerClient();
  const admin = createAdminClient();

  // Check 20 message limit
  const { count } = await supabase
    .from('messages_vocaux')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= 20) {
    return apiError('Message limit reached (20)', 'LIMIT_REACHED', 400);
  }

  // Get voice profile
  const { data: voiceProfile } = await supabase
    .from('voice_profiles')
    .select('elevenlabs_voice_id, clone_status')
    .eq('user_id', userId)
    .single();

  if (!voiceProfile || voiceProfile.clone_status !== 'ready') {
    return apiError('Voice not ready', 'VOICE_NOT_READY', 400);
  }

  // Get user language
  const { data: profil } = await supabase
    .from('profils')
    .select('langue')
    .eq('user_id', userId)
    .single();

  const langue = profil?.langue ?? 'fr';
  const voiceId = voiceProfile.elevenlabs_voice_id;

  // Check cache
  let audioUrl = await getCachedAudio(parsed.data.texte, voiceId, userId, langue);

  if (!audioUrl) {
    // Generate TTS
    const audioBuffer = await generateSpeech(parsed.data.texte, voiceId, langue);
    audioUrl = await cacheAudio(parsed.data.texte, voiceId, userId, langue, audioBuffer);
  }

  // Extract storage path from signed URL
  const urlObj = new URL(audioUrl);
  const pathParts = urlObj.pathname.split('/object/sign/audio-prive/');
  const storagePath = pathParts[1]?.split('?')[0] ?? '';

  // Get max order
  const { data: maxMsg } = await supabase
    .from('messages_vocaux')
    .select('ordre')
    .eq('user_id', userId)
    .order('ordre', { ascending: false })
    .limit(1)
    .single();

  const { data: inserted, error: dbError } = await supabase
    .from('messages_vocaux')
    .insert({
      user_id: userId,
      titre: parsed.data.titre,
      texte_source: parsed.data.texte,
      audio_storage_path: storagePath,
      phase: parsed.data.phase,
      mode_diffusion: parsed.data.mode_diffusion,
      ordre: (maxMsg?.ordre ?? 0) + 1,
    })
    .select()
    .single();

  if (dbError) return apiError('Failed to save message', 'DB_ERROR', 500);

  return NextResponse.json({ ...inserted, audio_url: audioUrl }, { status: 201 });
}
