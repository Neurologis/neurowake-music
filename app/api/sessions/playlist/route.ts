import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { apiError } from '@/lib/auth';

const MEDIA_SERVER_URL = process.env.MEDIA_SERVER_URL ?? 'https://media.neurologis-n8n.cloud';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return apiError('session_id requis', 'MISSING_PARAM', 400);

  // Fetch session from DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: session, error } = await admin
    .from('sessions_collectives')
    .select('id, nom, playlist_url, actif, date_expiration, gamma_enabled, messages_actifs')
    .eq('id', sessionId)
    .eq('actif', true)
    .single();

  if (error || !session) return apiError('Session introuvable', 'NOT_FOUND', 404);
  if (new Date(session.date_expiration) < new Date()) {
    return apiError('Session expirée', 'EXPIRED', 403);
  }

  // Fetch the playlist.json from VPS
  const playlistJsonUrl = `${MEDIA_SERVER_URL}/${session.playlist_url}/playlist.json`;

  let playlistData: {
    nom: string;
    description?: string;
    titres: Array<{
      id: string;
      titre: string;
      artiste: string;
      annee: number | null;
      fichier: string;
      duree_secondes?: number;
    }>;
    messages?: Array<{
      id: string;
      fichier: string;
      position: string;
    }>;
  };

  try {
    const vpsRes = await fetch(playlistJsonUrl, { next: { revalidate: 60 } });
    if (!vpsRes.ok) {
      return apiError(`Playlist VPS inaccessible (${vpsRes.status})`, 'VPS_ERROR', 502);
    }
    playlistData = await vpsRes.json();
  } catch (fetchErr) {
    console.error('[sessions/playlist] VPS fetch error:', fetchErr);
    return apiError('Playlist VPS inaccessible', 'VPS_ERROR', 502);
  }

  // Resolve full MP3 URLs
  const baseUrl = `${MEDIA_SERVER_URL}/${session.playlist_url}`;

  const titres = (playlistData.titres ?? []).map((t) => ({
    id:              t.id,
    titre:           t.titre,
    artiste:         t.artiste,
    annee:           t.annee,
    audio_url:       `${baseUrl}/${t.fichier}`,
    duree_secondes:  t.duree_secondes ?? null,
    repetitions:     1,
    boucle_infinie:  false,
  }));

  const messages = session.messages_actifs
    ? (playlistData.messages ?? []).map((m) => ({
        id:       m.id,
        fichier:  m.fichier,
        position: m.position,
        audio_url: `${baseUrl}/${m.fichier}`,
      }))
    : [];

  return NextResponse.json({
    session: {
      id:              session.id,
      nom:             session.nom,
      gamma_enabled:   session.gamma_enabled,
      messages_actifs: session.messages_actifs,
    },
    playlist: {
      nom:         playlistData.nom,
      description: playlistData.description ?? null,
      titres,
      messages,
    },
  });
}
