import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import { generateItunesLink, generateAmazonLink } from '@/lib/services/music-metadata';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const supabase = createServerClient();
  const { data: titres, error: dbError } = await supabase
    .from('titres_recommandes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (dbError) return apiError('DB error', 'DB_ERROR', 500);

  const itunes_token = process.env.ITUNES_AFFILIATE_TOKEN;
  const amazon_tag = process.env.AMAZON_ASSOCIATE_TAG;

  const titresAvecLiens = (titres ?? []).map((t) => ({
    ...t,
    itunes_url: generateItunesLink(t.titre, t.artiste, itunes_token),
    amazon_url: generateAmazonLink(t.titre, t.artiste, amazon_tag),
  }));

  return NextResponse.json({ titres: titresAvecLiens });
}
