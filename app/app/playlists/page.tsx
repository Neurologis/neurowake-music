'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Play, Trash2, ListMusic, ChevronDown, ChevronUp, Plus, Loader2, Lightbulb,
} from 'lucide-react';
import { useT } from '@/hooks/use-t';
import Link from 'next/link';

interface Playlist {
  id: string;
  nom: string;
  created_at: string;
}

interface PlaylistTrack {
  id: string;
  titre: string;
  artiste: string;
  annee: number | null;
}

export default function PlaylistsPage() {
  const { t }  = useT();
  const router = useRouter();

  const [playlists, setPlaylists]         = useState<Playlist[]>([]);
  const [loading, setLoading]             = useState(true);
  const [newName, setNewName]             = useState('');
  const [creating, setCreating]           = useState(false);

  // Titres expandés par playlist
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [tracksByPl, setTracksByPl]       = useState<Record<string, PlaylistTrack[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<string | null>(null);

  // Compteurs de titres (chargés une fois)
  const [countByPl, setCountByPl]         = useState<Record<string, number>>({});

  useEffect(() => { loadPlaylists(); }, []);

  async function loadPlaylists() {
    setLoading(true);
    const res = await fetch('/api/playlists');
    if (res.ok) {
      const { playlists: data } = await res.json();
      setPlaylists(data ?? []);
      // Charger les comptes de titres en parallèle
      loadAllCounts(data ?? []);
    }
    setLoading(false);
  }

  async function loadAllCounts(pls: Playlist[]) {
    const counts: Record<string, number> = {};
    await Promise.all(pls.map(async (pl) => {
      const res = await fetch(`/api/playlists/${pl.id}/titres`);
      if (res.ok) {
        const { titres } = await res.json();
        counts[pl.id] = (titres ?? []).length;
      }
    }));
    setCountByPl(counts);
  }

  async function createPlaylist() {
    const name = newName.trim();
    if (!name) { toast({ title: t('error_title'), description: 'Entrez un nom.', variant: 'destructive' }); return; }
    setCreating(true);
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: name }),
    });
    if (res.ok) {
      const { playlist } = await res.json();
      setPlaylists(p => [...p, playlist]);
      setCountByPl(c => ({ ...c, [playlist.id]: 0 }));
      setNewName('');
      toast({ title: t('playlist_created_ok'), description: `"${name}"` });
    } else {
      toast({ title: t('error_title'), description: t('error_generic'), variant: 'destructive' });
    }
    setCreating(false);
  }

  async function deletePlaylist(id: string, nom: string) {
    if (!confirm(t('delete_playlist_confirm'))) return;
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
    setPlaylists(p => p.filter(x => x.id !== id));
    setTracksByPl(t => { const c = { ...t }; delete c[id]; return c; });
    toast({ title: t('playlist_deleted_ok'), description: `"${nom}"` });
  }

  async function toggleTracks(pl: Playlist) {
    if (expandedId === pl.id) { setExpandedId(null); return; }
    setExpandedId(pl.id);
    if (tracksByPl[pl.id]) return; // déjà chargé
    setLoadingTracks(pl.id);
    const res = await fetch(`/api/playlists/${pl.id}/titres`);
    if (res.ok) {
      const { titres } = await res.json();
      setTracksByPl(t => ({ ...t, [pl.id]: titres ?? [] }));
    }
    setLoadingTracks(null);
  }

  async function removeTrack(plId: string, titreId: string) {
    await fetch(`/api/playlists/${plId}/titres`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre_id: titreId }),
    });
    setTracksByPl(t => ({
      ...t,
      [plId]: (t[plId] ?? []).filter(x => x.id !== titreId),
    }));
    setCountByPl(c => ({ ...c, [plId]: Math.max(0, (c[plId] ?? 1) - 1) }));
  }

  function launchPlaylist(pl: Playlist) {
    // Stocker l'id pour auto-lancement dans le lecteur
    sessionStorage.setItem('nw-launch-playlist', pl.id);
    router.push('/app');
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">{t('loading')}</div>;

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold text-[#2C2C2A]">{t('pl_page_title')}</h1>

      {/* ── Bandeau explicatif ─────────────────────────────────────────────── */}
      <div className="bg-[#4A6FA5]/5 border border-[#4A6FA5]/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-[#4A6FA5]">
          <Lightbulb className="h-4 w-4 flex-shrink-0" />
          <span>{t('pl_how_title')}</span>
        </div>
        <ol className="text-sm text-[#2C2C2A] space-y-1 pl-2">
          <li><span className="font-medium text-[#4A6FA5]">1.</span> {t('pl_step1')}</li>
          <li>
            <span className="font-medium text-[#4A6FA5]">2.</span> {t('pl_step2')} —{' '}
            <Link href="/app/titres" className="text-[#4A6FA5] underline underline-offset-2">{t('nav_tracks')}</Link>
          </li>
          <li><span className="font-medium text-[#4A6FA5]">3.</span> {t('pl_step3')}</li>
        </ol>
      </div>

      {/* ── Liste des playlists ───────────────────────────────────────────── */}
      {playlists.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">
          Aucune playlist. Créez-en une ci-dessous.
        </p>
      ) : (
        <div className="space-y-3">
          {playlists.map(pl => (
            <Card key={pl.id} className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50 hover:-translate-y-0.5 transition-all duration-200">
              <CardContent className="p-4 space-y-3">

                {/* En-tête playlist */}
                <div className="flex items-center gap-3">
                  <ListMusic className="h-5 w-5 text-[#4A6FA5] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base truncate">{pl.nom}</p>
                    <p className="text-sm text-muted-foreground">
                      {countByPl[pl.id] ?? '…'} {t('pl_tracks_count')}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white text-sm hover:-translate-y-0.5 transition-all"
                    onClick={() => launchPlaylist(pl)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {t('btn_launch')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-sm"
                    onClick={() => toggleTracks(pl)}
                  >
                    {expandedId === pl.id
                      ? <><ChevronUp className="h-3.5 w-3.5 mr-1.5" />{t('pl_view_tracks')}</>
                      : <><ChevronDown className="h-3.5 w-3.5 mr-1.5" />{t('pl_view_tracks')}</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-red-50 text-sm"
                    onClick={() => deletePlaylist(pl.id, pl.nom)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    {t('delete_btn')}
                  </Button>
                </div>

                {/* Titres expandés */}
                {expandedId === pl.id && (
                  <div className="border-t border-[#EDEAE3] pt-3 space-y-1">
                    {loadingTracks === pl.id ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('loading')}
                      </div>
                    ) : (tracksByPl[pl.id] ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">{t('pl_no_tracks')}</p>
                    ) : (
                      (tracksByPl[pl.id] ?? []).map((track, idx) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[#EDEAE3] group"
                        >
                          <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{track.titre}</p>
                            <p className="text-xs text-muted-foreground truncate">{track.artiste}{track.annee ? ` · ${track.annee}` : ''}</p>
                          </div>
                          <button
                            onClick={() => removeTrack(pl.id, track.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            title="Retirer de la playlist"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Créer une playlist ────────────────────────────────────────────── */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl border border-white/50">
        <CardContent className="p-4">
          <p className="font-semibold text-base mb-3">{t('pl_create')}</p>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPlaylist()}
              placeholder={t('new_pl_name')}
              className="text-base h-10 flex-1"
            />
            <Button
              onClick={createPlaylist}
              disabled={creating || !newName.trim()}
              className="bg-gradient-to-r from-[#F5A623] to-[#E8A856] text-white h-10 shrink-0 hover:-translate-y-0.5 transition-all"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
