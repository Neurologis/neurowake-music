import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();

  // Get the phase of the target message
  const { data: msg } = await supabase
    .from('messages_vocaux')
    .select('phase')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single();

  if (!msg) return apiError('Message not found', 'NOT_FOUND', 404);

  // Deactivate all messages in the same phase
  await supabase
    .from('messages_vocaux')
    .update({ actif: false })
    .eq('user_id', userId)
    .eq('phase', msg.phase);

  // Activate the target
  const { data, error: dbError } = await supabase
    .from('messages_vocaux')
    .update({ actif: true })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (dbError) return apiError('Activation failed', 'DB_ERROR', 500);
  return NextResponse.json(data);
}
