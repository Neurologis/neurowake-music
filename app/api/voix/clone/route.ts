import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { cloneVoice, deleteVoice, checkVoiceExists } from '@/lib/services/elevenlabs';

export async function POST(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const formData = await req.formData().catch(() => null);
  if (!formData) return apiError('Invalid form data', 'VALIDATION_ERROR', 400);

  const file = formData.get('audio') as File | null;
  if (!file) return apiError('No audio file', 'VALIDATION_ERROR', 400);

  // 10MB limit for voice sample
  if (file.size > 10 * 1024 * 1024) {
    return apiError('File too large (max 10MB)', 'FILE_TOO_LARGE', 400);
  }

  const supabase = createServerClient();

  // Delete existing voice if any
  const { data: existing } = await supabase
    .from('voice_profiles')
    .select('elevenlabs_voice_id')
    .eq('user_id', userId)
    .single();

  if (existing?.elevenlabs_voice_id) {
    const exists = await checkVoiceExists(existing.elevenlabs_voice_id);
    if (exists) {
      await deleteVoice(existing.elevenlabs_voice_id).catch(() => {});
    }
  }

  // Save pending status
  await supabase.from('voice_profiles').upsert({
    user_id: userId,
    elevenlabs_voice_id: 'pending',
    clone_status: 'pending',
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { voice_id } = await cloneVoice(buffer, `neurowake_${userId.slice(0, 8)}`);

    await supabase.from('voice_profiles').update({
      elevenlabs_voice_id: voice_id,
      clone_status: 'ready',
    }).eq('user_id', userId);

    return NextResponse.json({ status: 'ready', voice_id: '***' });
  } catch (err) {
    await supabase.from('voice_profiles').update({ clone_status: 'error' }).eq('user_id', userId);
    console.error('[voix/clone]', err);
    return apiError('Voice cloning failed', 'CLONE_ERROR', 503);
  }
}
