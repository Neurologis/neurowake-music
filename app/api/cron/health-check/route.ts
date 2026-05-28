import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Record<string, boolean> = {};
  const errors: string[] = [];

  // Check Supabase
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }
    );
    checks.supabase = res.ok;
    if (!res.ok) errors.push(`Supabase: ${res.status}`);
  } catch (e) {
    checks.supabase = false;
    errors.push(`Supabase: ${e}`);
  }

  // Check ElevenLabs
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    });
    checks.elevenlabs = res.ok;
    if (!res.ok) errors.push(`ElevenLabs: ${res.status}`);
  } catch (e) {
    checks.elevenlabs = false;
    errors.push(`ElevenLabs: ${e}`);
  }

  // Check MusicBrainz
  try {
    const res = await fetch('https://musicbrainz.org/ws/2/artist/?query=test&limit=1&fmt=json', {
      headers: { 'User-Agent': 'NeuroWake/1.0 (contact@neurologis.fr)' },
    });
    checks.musicbrainz = res.ok;
    if (!res.ok) errors.push(`MusicBrainz: ${res.status}`);
  } catch (e) {
    checks.musicbrainz = false;
    errors.push(`MusicBrainz: ${e}`);
  }

  const allOk = Object.values(checks).every(Boolean);

  if (!allOk && process.env.ADMIN_EMAIL) {
    console.error('[health-check] Services KO:', errors.join(', '));
  }

  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    errors,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
