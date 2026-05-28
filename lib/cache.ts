import crypto from 'crypto';
import { createAdminClient } from './supabase/server';

const CACHE_BUCKET = 'audio-prive';

function cacheKey(text: string, voiceId: string, langue: string): string {
  return crypto
    .createHash('sha256')
    .update(`${text}|${voiceId}|${langue}`)
    .digest('hex');
}

function cachePath(userId: string, hash: string): string {
  return `${userId}/cache/${hash}.mp3`;
}

export async function getCachedAudio(
  text: string,
  voiceId: string,
  userId: string,
  langue: string
): Promise<string | null> {
  const hash = cacheKey(text, voiceId, langue);
  const path = cachePath(userId, hash);
  const supabase = createAdminClient();

  const { data } = await supabase.storage
    .from(CACHE_BUCKET)
    .createSignedUrl(path, 3600);

  return data?.signedUrl ?? null;
}

export async function cacheAudio(
  text: string,
  voiceId: string,
  userId: string,
  langue: string,
  buffer: Buffer
): Promise<string> {
  const hash = cacheKey(text, voiceId, langue);
  const path = cachePath(userId, hash);
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(CACHE_BUCKET)
    .upload(path, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Cache upload failed: ${error.message}`);
  }

  const { data } = await supabase.storage
    .from(CACHE_BUCKET)
    .createSignedUrl(path, 3600);

  return data?.signedUrl ?? '';
}
