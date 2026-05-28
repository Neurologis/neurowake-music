const MB_BASE = 'https://musicbrainz.org/ws/2';
const CA_BASE = 'https://coverartarchive.org';
const USER_AGENT = 'NeuroWake/1.0 (contact@neurologis.fr)';

interface MBTrack {
  musicbrainz_id: string;
  titre: string;
  artiste: string;
  annee: number | null;
  pochette_url: string | null;
}

async function mbFetch(path: string): Promise<Response> {
  return fetch(`${MB_BASE}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
}

function buildDecadeQuery(
  anneDebut: number,
  anneeFin: number,
  pays: string,
  genres: string[]
): string {
  const parts: string[] = [
    `date:[${anneDebut} TO ${anneeFin}]`,
  ];

  const countryCode = getCountryCode(pays);
  if (countryCode) {
    parts.push(`country:${countryCode}`);
  }

  if (genres.length > 0) {
    const genreQuery = genres.slice(0, 3).join(' OR ');
    parts.push(`tag:(${genreQuery})`);
  }

  return parts.join(' AND ');
}

function getCountryCode(pays: string): string {
  const map: Record<string, string> = {
    France: 'FR',
    Espagne: 'ES',
    Spain: 'ES',
    'États-Unis': 'US',
    'United States': 'US',
    'Royaume-Uni': 'GB',
    'United Kingdom': 'GB',
    Italie: 'IT',
    Italy: 'IT',
    Belgique: 'BE',
    Belgium: 'BE',
    Québec: 'CA',
    Canada: 'CA',
    Argentine: 'AR',
    Argentina: 'AR',
  };
  return map[pays] ?? '';
}

async function getCoverArt(mbid: string): Promise<string | null> {
  try {
    const res = await fetch(`${CA_BASE}/release/${mbid}/front-250`, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (res.ok) {
      return `${CA_BASE}/release/${mbid}/front-250`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function searchTracksByPeriod(params: {
  annee_debut: number;
  annee_fin: number;
  pays: string;
  genres: string[];
  limit: number;
}): Promise<MBTrack[]> {
  const query = buildDecadeQuery(
    params.annee_debut,
    params.annee_fin,
    params.pays,
    params.genres
  );

  const url = `/recording/?query=${encodeURIComponent(query)}&limit=${params.limit}&fmt=json`;

  const res = await mbFetch(url);
  if (!res.ok) {
    throw new Error(`MusicBrainz search failed: ${res.status}`);
  }

  const data = await res.json();
  const recordings = data.recordings ?? [];

  const tracks: MBTrack[] = await Promise.all(
    recordings.slice(0, params.limit).map(async (r: Record<string, unknown>) => {
      const releases = r.releases as Record<string, unknown>[] | undefined;
      const firstRelease = releases?.[0];
      const releaseId = firstRelease?.id as string | undefined;

      const dateStr = (r.date ?? firstRelease?.date ?? '') as string;
      const annee = dateStr ? parseInt(dateStr.split('-')[0]) : null;

      const pochette_url = releaseId ? await getCoverArt(releaseId) : null;

      const artistCredit = r['artist-credit'] as Record<string, unknown>[] | undefined;
      const artiste =
        (artistCredit?.[0]?.artist as Record<string, string>)?.name ?? 'Inconnu';

      return {
        musicbrainz_id: r.id as string,
        titre: r.title as string,
        artiste,
        annee: isNaN(annee as number) ? null : annee,
        pochette_url,
      };
    })
  );

  return tracks;
}

export async function searchTrackFreetext(
  query: string,
  limit = 10
): Promise<MBTrack[]> {
  const url = `/recording/?query=${encodeURIComponent(query)}&limit=${limit}&fmt=json`;
  const res = await mbFetch(url);
  if (!res.ok) {
    throw new Error(`MusicBrainz freetext search failed: ${res.status}`);
  }

  const data = await res.json();
  const recordings = data.recordings ?? [];

  return Promise.all(
    recordings.map(async (r: Record<string, unknown>) => {
      const releases = r.releases as Record<string, unknown>[] | undefined;
      const firstRelease = releases?.[0];
      const releaseId = firstRelease?.id as string | undefined;
      const dateStr = (r.date ?? firstRelease?.date ?? '') as string;
      const annee = dateStr ? parseInt(dateStr.split('-')[0]) : null;
      const pochette_url = releaseId ? await getCoverArt(releaseId) : null;
      const artistCredit = r['artist-credit'] as Record<string, unknown>[] | undefined;
      const artiste =
        (artistCredit?.[0]?.artist as Record<string, string>)?.name ?? 'Inconnu';

      return {
        musicbrainz_id: r.id as string,
        titre: r.title as string,
        artiste,
        annee: isNaN(annee as number) ? null : annee,
        pochette_url,
      };
    })
  );
}

export async function getPochetteUrl(musicbrainz_id: string): Promise<string | null> {
  return getCoverArt(musicbrainz_id);
}
