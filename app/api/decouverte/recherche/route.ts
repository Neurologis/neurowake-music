import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, apiError } from '@/lib/auth';

/**
 * GET /api/decouverte/recherche?q=...
 *
 * Free-text music search via the iTunes Search API (no API key required).
 * Returns up to 20 tracks with artwork, year and iTunes purchase link.
 *
 * iTunes API docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */

interface ItunesTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  releaseDate?: string;    // ISO 8601 — "1987-06-01T07:00:00Z"
  artworkUrl100?: string;  // 100×100 JPEG — we upgrade to 300×300
  trackViewUrl?: string;   // iTunes Store deep-link
}

interface ItunesResponse {
  resultCount: number;
  results: ItunesTrack[];
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req);
  if (error) return error;

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) {
    return apiError('Query too short', 'VALIDATION_ERROR', 400);
  }

  try {
    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q.trim())}&media=music&entity=song&limit=20`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Cache results for 5 minutes to avoid hammering iTunes for the same query
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error('[decouverte/recherche] iTunes API HTTP error:', res.status);
      return apiError('Search service unavailable', 'SEARCH_ERROR', 503);
    }

    const data: ItunesResponse = await res.json();

    const titres = (data.results ?? [])
      .filter((t) => t.trackId && t.trackName && t.artistName)
      .map((t) => ({
        // Use "itunes-{trackId}" as the local id — never conflicts with Supabase UUIDs
        id: `itunes-${t.trackId}`,
        titre: t.trackName!,
        artiste: t.artistName!,
        annee: t.releaseDate ? parseInt(t.releaseDate.slice(0, 4), 10) : null,
        // Upgrade 100×100 thumbnail to 300×300 for sharper display
        pochette_url: t.artworkUrl100
          ? t.artworkUrl100.replace('100x100bb', '300x300bb')
          : null,
        itunes_url: t.trackViewUrl ?? null,
        amazon_url: null,
        statut: 'propose' as const,
        musicbrainz_id: null,
        phase_recommandee: null,
      }));

    return NextResponse.json({ titres });
  } catch (err) {
    console.error('[decouverte/recherche] Unexpected error:', err);
    return apiError('Search failed', 'SEARCH_ERROR', 503);
  }
}
