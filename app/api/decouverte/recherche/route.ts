import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';
import { searchTrackFreetext } from '@/lib/services/musicbrainz';
import { generateItunesLink, generateAmazonLink } from '@/lib/services/music-metadata';

export async function GET(req: NextRequest) {
  const { userId, error } = await requireAuth(req);
  if (error) return error;

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.length < 2) {
    return apiError('Query too short', 'VALIDATION_ERROR', 400);
  }

  try {
    const titres = await searchTrackFreetext(q, 10);
    const itunes_token = process.env.ITUNES_AFFILIATE_TOKEN;
    const amazon_tag = process.env.AMAZON_ASSOCIATE_TAG;

    const result = titres.map((t) => ({
      ...t,
      itunes_url: generateItunesLink(t.titre, t.artiste, itunes_token),
      amazon_url: generateAmazonLink(t.titre, t.artiste, amazon_tag),
    }));

    return NextResponse.json({ titres: result });
  } catch (err) {
    console.error('[decouverte/recherche]', err);
    return apiError('Search failed', 'SEARCH_ERROR', 503);
  }
}
