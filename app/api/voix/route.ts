import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { deleteVoice } from '@/lib/services/elevenlabs';

export async function DELETE(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data } = await supabase
    .from('voice_profiles')
    .select('elevenlabs_voice_id')
    .eq('user_id', userId)
    .single();

  if (data?.elevenlabs_voice_id && data.elevenlabs_voice_id !== 'pending') {
    await deleteVoice(data.elevenlabs_voice_id).catch(() => {});
  }

  await supabase.from('voice_profiles').delete().eq('user_id', userId);

  return NextResponse.json({ success: true });
}
